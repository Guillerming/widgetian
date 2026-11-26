// macOS readings that have no command-line tool, through koffi (no extra permissions needed):
//   - temperatures: the sensors the IOKit HID event system publishes (what menu-bar monitors read);
//   - volumes: mounted disks with the free space Finder shows, which counts purgeable files as free.
// Main process only. Every CoreFoundation object created here is released; Foundation objects live
// in an autorelease pool popped at the end of each call.
import koffi from "koffi";

const objc = koffi.load("/usr/lib/libobjc.A.dylib");
const coreFoundation = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
const iokit = koffi.load("/System/Library/Frameworks/IOKit.framework/IOKit");
koffi.load("/System/Library/Frameworks/Foundation.framework/Foundation");

const UTF8 = 0x08000100;
const CF_NUMBER_SINT32 = 3;
// IOHIDEventTypes.h: temperature events, and the field that holds their value.
const TEMPERATURE_EVENT = 15;
const TEMPERATURE_FIELD = TEMPERATURE_EVENT << 16;
// Apple's vendor usage page and the "temperature sensor" usage.
const SENSOR_USAGE_PAGE = 0xff00;
const SENSOR_USAGE = 5;
// NSVolumeEnumerationSkipHiddenVolumes: the volumes Finder lists.
const SKIP_HIDDEN_VOLUMES = 1 << 1;

const CFNumberCreate = coreFoundation.func("void *CFNumberCreate(void *allocator, long type, _In_ int32_t *value)");
const CFStringCreateWithCString = coreFoundation.func("void *CFStringCreateWithCString(void *allocator, const char *text, uint32_t encoding)");
const CFStringGetCString = coreFoundation.func("bool CFStringGetCString(void *text, _Out_ uint8_t *buffer, long size, uint32_t encoding)");
const CFDictionaryCreate = coreFoundation.func(
  "void *CFDictionaryCreate(void *allocator, void **keys, void **values, long count, void *keyCallbacks, void *valueCallbacks)",
);
const CFArrayGetCount = coreFoundation.func("long CFArrayGetCount(void *array)");
const CFArrayGetValueAtIndex = coreFoundation.func("void *CFArrayGetValueAtIndex(void *array, long index)");
const CFRelease = coreFoundation.func("void CFRelease(void *object)");
const KEY_CALLBACKS = coreFoundation.symbol("kCFTypeDictionaryKeyCallBacks", "void");
const VALUE_CALLBACKS = coreFoundation.symbol("kCFTypeDictionaryValueCallBacks", "void");

const IOHIDEventSystemClientCreate = iokit.func("void *IOHIDEventSystemClientCreate(void *allocator)");
const IOHIDEventSystemClientSetMatching = iokit.func("int IOHIDEventSystemClientSetMatching(void *client, void *matching)");
const IOHIDEventSystemClientCopyServices = iokit.func("void *IOHIDEventSystemClientCopyServices(void *client)");
const IOHIDServiceClientCopyProperty = iokit.func("void *IOHIDServiceClientCopyProperty(void *service, void *key)");
const IOHIDServiceClientCopyEvent = iokit.func(
  "void *IOHIDServiceClientCopyEvent(void *service, int64_t type, int32_t options, int64_t timestamp)",
);
const IOHIDEventGetFloatValue = iokit.func("double IOHIDEventGetFloatValue(void *event, int32_t field)");

const selector = objc.func("void *sel_registerName(const char *name)");
const getClass = objc.func("void *objc_getClass(const char *name)");
const poolPush = objc.func("void *objc_autoreleasePoolPush(void)");
const poolPop = objc.func("void objc_autoreleasePoolPop(void *pool)");
// objc_msgSend must be declared with the exact prototype of each call (required on arm64).
const send = objc.func("objc_msgSend", "void *", ["void *", "void *"]);
const sendText = objc.func("objc_msgSend", "void *", ["void *", "void *", "const char *"]);
const sendIndex = objc.func("objc_msgSend", "void *", ["void *", "void *", "unsigned long"]);
const sendCount = objc.func("objc_msgSend", "unsigned long", ["void *", "void *"]);
const sendVolumes = objc.func("objc_msgSend", "void *", ["void *", "void *", "void *", "unsigned long"]);
const sendResource = objc.func("objc_msgSend", "bool", ["void *", "void *", "_Out_ void **", "void *", "void *"]);
const sendInt64 = objc.func("objc_msgSend", "int64_t", ["void *", "void *"]);
const sendBool = objc.func("objc_msgSend", "bool", ["void *", "void *"]);
const sendCText = objc.func("objc_msgSend", "const char *", ["void *", "void *"]);

const cfString = (text) => CFStringCreateWithCString(null, text, UTF8);

const textOf = (cfText) => {
  const buffer = Buffer.alloc(256);
  if (!CFStringGetCString(cfText, buffer, buffer.length, UTF8)) return "";
  return buffer.toString("utf8", 0, buffer.indexOf(0));
};

let sensors = null;

/**
 * The temperature sensors, found once: they do not change while the Mac runs. The service array is
 * kept for the life of the app, so its services stay valid.
 * @returns {{ name: string, service: unknown }[]}
 */
const temperatureSensors = () => {
  if (sensors) return sensors;
  sensors = [];
  const keys = [cfString("PrimaryUsagePage"), cfString("PrimaryUsage")];
  const values = [CFNumberCreate(null, CF_NUMBER_SINT32, [SENSOR_USAGE_PAGE]), CFNumberCreate(null, CF_NUMBER_SINT32, [SENSOR_USAGE])];
  const matching = CFDictionaryCreate(null, keys, values, 2, KEY_CALLBACKS, VALUE_CALLBACKS);
  const client = IOHIDEventSystemClientCreate(null);
  const services = client ? (IOHIDEventSystemClientSetMatching(client, matching), IOHIDEventSystemClientCopyServices(client)) : null;
  [...keys, ...values, matching].forEach((object) => CFRelease(object));
  if (!services) return sensors;
  const productKey = cfString("Product");
  for (let index = 0; index < CFArrayGetCount(services); index += 1) {
    const service = CFArrayGetValueAtIndex(services, index);
    const product = IOHIDServiceClientCopyProperty(service, productKey);
    if (!product) continue;
    sensors.push({ name: textOf(product), service });
    CFRelease(product);
  }
  CFRelease(productKey);
  return sensors;
};

// Each reading is a round trip to a system daemon (~1 ms): koffi's async calls keep the main thread free.
const copyEvent = (service) =>
  new Promise((resolve, reject) => {
    IOHIDServiceClientCopyEvent.async(service, TEMPERATURE_EVENT, 0, 0, (error, event) => (error ? reject(error) : resolve(event)));
  });

/**
 * The temperature sensors whose name matches `pattern`. Empty where there are none (most Intel Macs).
 * @param {RegExp} pattern
 * @returns {Promise<{ name: string, celsius: number }[]>}
 */
export const readTemperatures = async (pattern) => {
  const readings = [];
  for (const { name, service } of temperatureSensors().filter((sensor) => pattern.test(sensor.name))) {
    const event = await copyEvent(service);
    if (!event) continue;
    readings.push({ name, celsius: IOHIDEventGetFloatValue(event, TEMPERATURE_FIELD) });
    CFRelease(event);
  }
  return readings;
};

/**
 * Mounted volumes as Finder lists them, sizes in bytes. `free` is Finder's "available": it counts
 * space macOS can reclaim (caches, local snapshots), so it is larger than `df` says.
 * @returns {{ name: string, path: string, total: number, free: number, readOnly: boolean, internal: boolean }[]}
 */
export const readVolumes = () => {
  const pool = poolPush();
  try {
    const nsString = (text) => sendText(getClass("NSString"), selector("stringWithUTF8String:"), text);
    const resource = (url, key) => {
      const out = [null];
      const found = sendResource(url, selector("getResourceValue:forKey:error:"), out, nsString(key), null);
      return found ? out[0] : null;
    };
    const number = (url, key) => {
      const value = resource(url, key);
      return value ? Number(sendInt64(value, selector("longLongValue"))) : 0;
    };
    const flag = (url, key) => {
      const value = resource(url, key);
      return value ? sendBool(value, selector("boolValue")) : false;
    };
    const manager = send(getClass("NSFileManager"), selector("defaultManager"));
    const urls = sendVolumes(manager, selector("mountedVolumeURLsIncludingResourceValuesForKeys:options:"), null, SKIP_HIDDEN_VOLUMES);
    if (!urls) return [];
    const volumes = [];
    for (let index = 0; index < sendCount(urls, selector("count")); index += 1) {
      const url = sendIndex(urls, selector("objectAtIndex:"), index);
      const name = resource(url, "NSURLVolumeLocalizedNameKey");
      volumes.push({
        name: name ? sendCText(name, selector("UTF8String")) : "",
        path: sendCText(send(url, selector("path")), selector("UTF8String")),
        total: number(url, "NSURLVolumeTotalCapacityKey"),
        free: number(url, "NSURLVolumeAvailableCapacityForImportantUsageKey"),
        readOnly: flag(url, "NSURLVolumeIsReadOnlyKey"),
        internal: flag(url, "NSURLVolumeIsInternalKey"),
      });
    }
    return volumes;
  } finally {
    poolPop(pool);
  }
};
