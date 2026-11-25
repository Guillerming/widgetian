// Files that live next to the app instead of inside app.asar, because other processes run them.
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../resources");

const isPackaged = () => SOURCE_FOLDER.includes(`app.asar${path.sep}`);

export const resourceFile = (name) => path.join(isPackaged() ? process.resourcesPath : SOURCE_FOLDER, name);
