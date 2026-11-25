// The town name for this Mac's position, from macOS's own geocoder (the one Maps uses): no web
// service, account or key of ours. Reached through osascript's Objective-C bridge, in its own process.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const OSASCRIPT = "/usr/bin/osascript";
const GEOCODER_TIMEOUT_MS = 8000;
const PROCESS_TIMEOUT_MS = 10000;

// JXA cannot see CLLocation by name, so the class is looked up at run time.
const SCRIPT = `
ObjC.import("Foundation");
ObjC.import("CoreLocation");
function run([position]) {
  const [latitude, longitude] = JSON.parse(position);
  const location = $.NSClassFromString("CLLocation").alloc.initWithLatitudeLongitude(latitude, longitude);
  let result = null;
  $.CLGeocoder.alloc.init.reverseGeocodeLocationCompletionHandler(location, (places, error) => {
    const place = places.isNil() || places.count === 0 ? null : places.objectAtIndex(0);
    const text = (key) => (place ? ObjC.unwrap(place[key]) || "" : "");
    result = { city: text("locality"), county: text("subAdministrativeArea"), region: text("administrativeArea") };
  });
  const deadline = Date.now() + ${GEOCODER_TIMEOUT_MS};
  while (!result && Date.now() < deadline) {
    $.NSRunLoop.mainRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.1));
  }
  return JSON.stringify(result || {});
}`;

const round = (value) => Math.round(Number(value) * 100) / 100;

/** What the geocoder found → the name to show ("" when it found nothing). */
export const placeLabel = ({ city = "", county = "", region = "" } = {}) => city || county || region;

/** Rounded to ~1 km, as JSON: a bare negative number would look like an option to osascript. */
export const positionArgument = ({ latitude, longitude }) => {
  const position = [round(latitude), round(longitude)];
  if (!position.every(Number.isFinite)) throw new Error("No location yet");
  return JSON.stringify(position);
};

/** @param {{ latitude: number, longitude: number }} position */
export const placeName = async (position) => {
  const args = ["-l", "JavaScript", "-e", SCRIPT, positionArgument(position)];
  const { stdout } = await run(OSASCRIPT, args, { timeout: PROCESS_TIMEOUT_MS });
  return { name: placeLabel(JSON.parse(stdout)) };
};
