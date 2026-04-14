import { localStorageJson } from "../shared/storage/local-storage.js";

export const readJson = localStorageJson.read;
export const writeJson = localStorageJson.write;
export const readString = localStorageJson.readString;
export const writeString = localStorageJson.writeString;
export const removeKey = localStorageJson.remove;
