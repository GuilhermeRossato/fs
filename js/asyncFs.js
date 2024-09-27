// Asyncronous file system handler

import fs from "node:fs";
import path from "node:path";

/**
 * Operation mode type (changes how errors are treated)
 * @type { 'normal' | 'strict' | 'forgiving' }
 */
const operation = 'normal';

/**
 * @param  {...any} args
 * @returns {AsyncFsObj}
 */
export function asyncFs(...args) {
  console.warn('Warning: Untested');
  const { path, problems } = parseAsyncFsPathArgs(...args);
  if (problems.length && operation === "forgiving") {
    console.log(`Warning: Got invalid arguments: ${JSON.stringify(problems)}`);
  } else if (problems.length) {
    throw new Error(`Invalid arguments: ${JSON.stringify(problems)}`);
  }
  return AsyncFsObj.fromCache(path);
}

/**
 * A file system object with asyncronous methods
 */
class AsyncFsObj {
  /**
   * Records instances of `AsyncFsObj` by path.
   * @type {Record<string, AsyncFsObj>}
   */
  static _instanceCacheRecord = {};

  /**
   * Retrieves an instance from cache or creates a new one.
   * @param {string | { path: string }} path - The path to the file system object.
   * @returns {AsyncFsObj} An instance of `AsyncFsObj`.
   */
  static fromCache(path) {
    console.warn('Warning: Untested');
    if (typeof path !== "string") {
      path = path.path;
    }
    return (
      this._instanceCacheRecord[path] ||
      (this._instanceCacheRecord[path] = new AsyncFsObj(path))
    );
  }

  /**
   * Methods associated with the file system object.
   * @type {Record<string, any>}
   */
  _methods = {};

  /**
   * Gets a bound method based on the provided method.
   * @param {Function} method - The method to be bound.
   * @returns {Function} A bound method.
   * @throws {Error} Throws an error if the argument is invalid or the method cannot be found.
   */
  getBoundMethod(method) {
    console.warn('Warning: Untested');
    if (
      !method ||
      typeof method !== "function" ||
      !(method instanceof Function)
    ) {
      throw new Error("Invalid argument");
    }
    const name = method.name;
    if (fs.promises[name] !== method) {
      throw new Error(`Could not find method named ${String(name)}`);
    }
    let bound = this._methods[name];
    if (!bound) {
      bound = method.bind(fs.promises, this._path);
      if (
        !bound ||
        typeof bound !== "function" ||
        !(bound instanceof Function)
      ) {
        throw new Error("Invalid bound");
      }
      this._methods[name] = bound;
    }
    return bound;
  }

  /**
   * Cached file statistics.
   * @type {fs.Stats|undefined}
   */
  cachedStat;

  /**
   * Parent file system object.
   * @type {AsyncFsObj|undefined}
   */
  _parent;

  /**
   * Path to the file system object.
   * @type {string}
   */
  _path;

  /**
   * Creates an instance of `AsyncFsObj`.
   * @param {string} path - The path to the file system object.
   */
  constructor(path) {
    this._path = path;
  }

  /**
   * Returns the path of the file system object.
   * @returns {string} The path of the file system object.
   */
  toString() {
    return this._path;
  }

  get stats() {
    return this.stat;
  }

  async stat() {
    const func = this.getBoundMethod(fs.promises.stat);
    /** @type {any} */
    const fallback = null;
    const { data, error } = await attemptFileOperation(fallback, func);

    if (error || !data || !(data instanceof fs.Stats)) {
      return null;
    }
    this.cachedStat = data;
    return data;
  }

  async type() {
    const s = await this.stat();
    return s?.isFile() ? "file" : s?.isDirectory() ? "folder" : "unknown";
  }

  async file() {
    const t = await this.type();
    return t === "file" ? true : t === "folder" ? false : undefined;
  }

  async folder() {
    const t = await this.type();
    return t === "folder" ? true : t === "file" ? false : undefined;
  }

  async exist() {
    return await this.exists();
  }

  async exists() {
    const s = await this.stat();
    return Boolean(s);
  }

  get parts() {
    return this._path.split("/");
  }

  get name() {
    return this._path.split("/").pop() || "";
  }

  get ext() {
    const name = this.name;
    const i = name.lastIndexOf(".");
    return i === -1 ? "" : name?.substring(i + 1);
  }

  get path() {
    return this._path;
  }

  get parent() {
    if (!this._parent) {
      if (
        this._path === "/" ||
        this._path.toUpperCase().replace(":", "") === "C/" ||
        this._path.toUpperCase().replace(":", "") === "D/"
      ) {
        throw new Error("Unsupported parent");
      }
      const parts = this.parts;
      const parent =
        parts.length <= 2
          ? path
              .dirname(path.resolve(this._path))
              .replace(/\\/g, "/")
              .split("/")
          : parts.slice(0, parts.length - 1);
      this._parent = AsyncFsObj.fromCache(parent.join("/"));
    }
    return this._parent;
  }

  /**
   * Creates a folder if it does not exist and return its object instance.
   * Also generates parents recursively as needed
   * @param {string} [name] - The optional target folder name, if not provided then it creates itself.
   * @returns {Promise<AsyncFsObj | this>} The created folder's AsyncFsObj instance or the current instance.
   */
  async mkdir(name) {
    const type = await this.type();
    if (!name) {
      if (type === "folder") {
        return this;
      }
      if (type === "file") {
        throw new Error(
          `Cannot create folder on an existing file at ${this._path}`
        );
      }
      const func = this.getBoundMethod(fs.promises.mkdir);
      /** @type {any} */
      const fallback = null;
      const { error } = await attemptFileOperation(fallback, func, {
        recursive: true,
      });
      if (error && operation) {
        throw error;
      }
      return this;
    }
    if (name.includes("/") || name.includes("\\")) {
      throw new Error(`Cannot create child folder with name ${name}`);
    }
    if (type === "file") {
      throw new Error(
        `Cannot create folder inside an existing file at ${this._path}`
      );
    }
    const target = AsyncFsObj.fromCache(`${this._path}/${name}`);
    const targetType = await target.type();
    if (targetType === "file") {
      throw new Error(
        `Cannot create folder on an existing file inside ${this._path}`
      );
    }
    if (targetType === "folder") {
      return target;
    }
    return await target.mkdir();
  }

  async siblings() {
    const p = this.parent;
    const ptype = await p.type();
    if (ptype !== "folder") {
      if (operation) {
        throw new Error(
          `Cannot get children of non-folder at ${p.path} (strict mode)`
        );
      }
      return [];
    }
    const list = await this.parent.children();
    const type = await this.type();
    if (
      type !== "unknown" &&
      (list.indexOf(this) === -1 || !list.includes(this))
    ) {
      if (operation) {
        throw new Error(
          "Something went wrong finding itself on parent children"
        );
      } else {
        console.warn(
          "Something went wrong finding itself on parent children",
          type,
          list
        );
      }
    }
    return list.filter((f) => f !== this);
  }

  /**
   * Retrieve children list of the current fs object instance
   * If the folder does not exist it returns an empty array or throws an error if the stricy flag is enabled
   * @param {Function} [filter] - A function used to filter the children based on certain criteria.
   * @returns {Promise<AsyncFsObj[]>} An array of filtered AsyncFsObj instances.
   */
  async children(filter) {
    const t = await this.type();
    if (t !== "folder") {
      if (operation) {
        throw new Error(
          `Cannot get children of non-folder at ${this._path} (strict mode)`
        );
      }
      return [];
    }
    const func = this.getBoundMethod(fs.promises.readdir);
    const { data, error } = await attemptFileOperation([], func);
    if (error || !data || !(data instanceof Array) || !data.length) {
      return [];
    }
    const list = data.map((name) =>
      AsyncFsObj.fromCache(parseAsyncFsPathArgs(name))
    );
    if (!filter) {
      return list;
    }

    const filtered = [];
    for (let i = 0; i < list.length; i++) {
      let verdict = filter(list[i], i, list);
      if (verdict && verdict instanceof Promise) {
        verdict = await verdict;
      }
      if (verdict) {
        filtered.push(list[i]);
      }
    }
    return filtered;
  }
  async files() {
    return await this.children((f) => f.file());
  }

  async folders() {
    return await this.children((f) => f.folder());
  }

  async data() {
    if (!(await this.file())) {
      if (operation) {
        throw new Error(`Cannot get data of non-file at ${this._path}`);
      }
      return undefined;
    }
    const func = this.getBoundMethod(fs.promises.readFile);
    /** @type {any} */
    const fallback = null;
    const { data, error } = await attemptFileOperation(fallback, func);
    if (error && operation) {
      throw error;
    }
    if (error || !data) {
      return null;
    }
    if (data && typeof data === "object") {
      return null;
    }
    if (data && !(data instanceof Buffer)) {
      return null;
    }
    return data;
  }

  /**
   * Asynchronously overwrites the data in the file.
   * @param {string | Buffer} data - The data to be written to the file.
   * @throws {Error} if the current fs obj is not a existing file
   * @returns {Promise<boolean>} - A promise that resolves to true if the operation was successful.
   */
  async overwrite(data) {
    if (await this.file()) {
      return await this.write(data, true);
    }
    throw new Error(`Rewrite target does not exist at ${this._path}`);
  }
  /**
   * Represents a method to write data to the AsyncFsObj instance.
   * @param {string | Buffer} data - The data to write, either a string or a Buffer.
   * @param {boolean} overwrite - Flag indicating whether to overwrite existing content (default: false).
   * @returns {Promise<boolean>} Returns true if write is successful, false otherwise.
   */
  async write(data, overwrite = false) {
    const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    if (!overwrite && !(await this.file())) {
      throw new Error(
        `Write target already exists at ${this._path} (overwrite disabled)`
      );
    }
    if (operation && (await this.folder())) {
      throw new Error(`Cannot write on folder at ${this._path}`);
    }
    const func = this.getBoundMethod(fs.promises.readFile);
    const { error } = await attemptFileOperation(null, func, buffer);
    if (error && operation) {
      throw error;
    }
    return !error;
  }

  /**
   * Represents a method to append data to the AsyncFsObj instance.
   * @param {string | Buffer} data - The data to append, either a string or a Buffer.
   * @param {boolean} mustExist - Flag indicating whether the file must exist for appending (default: false).
   * @returns {Promise<boolean>} Returns true if append is successful, false otherwise.
   */
  async append(data, mustExist = false) {
    const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    if (mustExist && !(await this.file())) {
      throw new Error(`Append file target does not exist at ${this._path}`);
    }
    if (operation && (await this.folder())) {
      throw new Error(`Cannot write on non-file at ${this._path}`);
    }
    const func = this.getBoundMethod(fs.promises.readFile);
    const { error } = await attemptFileOperation(null, func, buffer);
    if (error && operation) {
      throw error;
    }
    return !error;
  }

  /**
   * Get an object instance by adding a suffix to the current path.
   * @param {string} sufix - The sufix to add before the current path.
   * @returns {AsyncFsObj} An instance representing the nested path.
   */
  nested(sufix) {
    return AsyncFsObj.fromCache(`${this._path}/${sufix}`);
  }

  /**
   * Get an internal object instance even if it does not exist, unless the current instance is a file.
   * @param {string} name - The name of the object instance.
   * @returns {Promise<AsyncFsObj | null>} Returns the object instance or null if targeting a file.
   */
  async inside(name) {
    const t = await this.type();
    if (t === "file") {
      if (operation) {
        throw new Error(
          `Cannot target child inside existing file at ${this._path}`
        );
      }
      return null;
    }
    return AsyncFsObj.fromCache(`${this._path}/${name}`);
  }
}
/**
 * Parses arguments to generate a standardized path object.
 * @param {any[]} args - Arguments to be parsed into a path object.
 * @returns {Object} The parsed path object containing path, parts, and problems.
 */
function parseAsyncFsPathArgs(...args) {
  console.log(`[parseAsyncFsPathArgs] called with`, args.length, 'arguments');
  const relevant =
    args.length === 3 &&
    typeof args[1] === "number" &&
    args[2] &&
    args[2] instanceof Array &&
    args[2][args[1]] === args[0]
      ? [args[0]]
      : args;
  const problems = [];
  const parts = [];
  for (let i = 0; i < relevant.length; i++) {
    const a = relevant[i];
    if (a === undefined || a === null) {
      continue;
    }
    if (parts.length === 0 && a === "") {
      parts.push(".");
      continue;
    }
    if (typeof a === "string" || typeof a === "number") {
      parts.push(a.toString());
      continue;
    }
    if (!a) {
      problems.push({ i, arg: a });
      continue;
    }
    if (a && typeof a === "object" && a instanceof Array) {
      for (const b of a) {
        relevant.push(b);
      }
      continue;
    }
    if (a && typeof a === "object" && Object.keys(a).length) {
      const keys = [
        "name",
        "path",
        "filePath",
        "filepath",
        "file_path",
        "fullPath",
        "fullpath",
        "full_path",
      ];
      const key = keys.find((k) => typeof a[k] === "string" && a[k].length);
      if (key) {
        parts.push(a[key]);
        continue;
      }
    }
    problems.push({ i, arg: a });
    continue;
  }
  let p = parts
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/\/+/g, "/")
    .replace(/\?/g, "");
  if (p.endsWith("/")) {
    p = p.substring(0, p.length - 1);
  }
  p = path.resolve(p).replace(/\\/g, "/");
  const prefix = process.cwd().replace(/\\/g, "/");
  if (prefix.startsWith(`${p}/`)) {
    p = `.${p.substring(prefix.length)}`;
  }
  return {
    path: p,
    parts,
    problems,
  };
}

/**
 * Attempts a file operation function and handles resource busy errors by retrying once
 * 
 * @template A
 * @param {A | undefined | null} fallback - The fallback value.
 * @param {Function} func - The function to be executed.
 * @param  {...any} args - Arguments for the function.
 * @returns {Promise<{ data: A | undefined | null, error?: Error | undefined }>} - Object containing data and error information.
 */
async function attemptFileOperation(fallback, func, ...args) {
  let error;
  for (let i = 0; i < 2; i++) {
    try {
      fallback = await func(...args);
      error = undefined;
      break;
    } catch (err) {
      error = err;
      if (err.code !== "ENOENT" && err.code !== "EBUSY") {
        break;
      }
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(100 + 100 * Math.random()))
    );
  }
  if (!error) {
    return { data: fallback };
  }
  return { data: fallback, error };
}
