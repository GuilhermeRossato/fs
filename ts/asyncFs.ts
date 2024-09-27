// Asyncronous file system handler

import fs from "node:fs";
import path from "node:path";

/**
 * Operation mode type (changes how errors are treated)
 */
const operation: "normal" | "strict" | "forgiving" = "normal";

export function asyncFs(...args: any[]) {
  const { path, problems } = parseAsyncFsArgs(...args);
  if (problems.length && operation === "forgiving") {
    console.log(`Warning: Got invalid arguments: ${JSON.stringify(problems)}`);
  } else if (problems.length) {
    throw new Error(`Invalid arguments: ${JSON.stringify(problems)}`);
  }
  return AsyncFsObj.fromCache(path);
}

class AsyncFsObj {
  static instanceCacheRecord: Record<string, AsyncFsObj> = {};

  static fromCache(path: string | { path: string }) {
    if (typeof path !== "string") {
      path = path.path;
    }
    return (
      this.instanceCacheRecord[path] ||
      (this.instanceCacheRecord[path] = new AsyncFsObj(path))
    );
  }

  private _methods: Record<string, any> = {};

  private getBoundMethod(method: any) {
    if (
      !method ||
      typeof method !== "function" ||
      !(method instanceof Function)
    ) {
      throw new Error("Invalid argument");
    }
    const name: keyof typeof fs.promises = method.name as any;
    if (fs.promises[name] !== method) {
      throw new Error(`Could not find method named ${String(name)}`);
    }
    let bound = this._methods[name as keyof typeof this._methods];
    if (!bound) {
      bound = method.bind(fs.promises, this._path);
      if (
        !bound ||
        typeof bound !== "function" ||
        !(bound instanceof Function)
      ) {
        throw new Error("Invalid bound");
      }
      this._methods[name as keyof typeof this._methods] = bound;
    }
    return bound;
  }
  public cachedStat?: fs.Stats;
  private _parent?: AsyncFsObj;
  private _path: string;

  constructor(path: string) {
    this._path = path;
  }

  toString() {
    return this._path;
  }

  get stats() {
    return this.stat;
  }

  async stat() {
    const func = this.getBoundMethod(fs.promises.stat);
    const { data, error } = await attemptFileOperation<fs.Stats>(null, func);
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

  set path(target: string) {
    if (target !== this._path) {
      throw new Error("Invalid path assignment");
    }
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
   * @param name The optional target folder name, if not provided then it creates itself
   */
  async mkdir(name?: string): Promise<AsyncFsObj | this> {
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
      console.log("Bound method");
      const func = this.getBoundMethod(fs.promises.mkdir);
      const { error } = await attemptFileOperation(null, func, {
        recursive: true,
      });
      console.log("Result", { error });
      if (error && operation === "strict") {
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
      if (operation === "strict") {
        throw new Error(
          `Cannot get children of non-folder at ${p.path} (operation === 'strict' mode)`
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
      if (operation === "strict") {
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

  async children(
    filter?: (
      obj: AsyncFsObj,
      i: number,
      children: AsyncFsObj[]
    ) => boolean | undefined | null | Promise<boolean | undefined | null>
  ) {
    const t = await this.type();
    if (t !== "folder") {
      if (operation === "strict") {
        throw new Error(
          `Cannot get children of non-folder at ${this._path} (operation === 'strict' mode)`
        );
      }
      return [];
    }
    const func = this.getBoundMethod(fs.promises.readdir);
    const { data, error } = await attemptFileOperation<string[]>([], func);
    if (error || !data || !(data instanceof Array) || !data.length) {
      return [];
    }
    const list = data.map((name) =>
      AsyncFsObj.fromCache(parseAsyncFsArgs(name))
    );
    if (!filter) {
      return list;
    }
    const filtered: typeof list = [];
    for (let i = 0; i < list.length; i++) {
      let veredict = filter(list[i], i, list);
      if (veredict && veredict instanceof Promise) {
        veredict = await veredict;
      }
      if (veredict) {
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
      if (operation === "strict") {
        throw new Error(`Cannot get data of non-file at ${this._path}`);
      }
      return undefined;
    }
    const func = this.getBoundMethod(fs.promises.readFile);
    const { data, error } = await attemptFileOperation<Buffer>(null, func);
    if (error && operation === "strict") {
      throw error;
    }
    if (error || !data || !(data instanceof Buffer)) {
      return null;
    }
    return data;
  }

  async overwrite(data: string | Buffer) {
    if (await this.exists()) {
      return await this.write(data, true);
    }
    throw new Error(`Rewrite target does not exist at ${this._path}`);
  }

  async write(data: string | Buffer, overwrite = false) {
    const buffer: Buffer =
      typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    if (!overwrite && !(await this.file())) {
      throw new Error(
        `Write target already exists at ${this._path} (overwrite disabled)`
      );
    }
    if (operation === "strict" && (await this.folder())) {
      throw new Error(`Cannot write on folder at ${this._path}`);
    }
    const func = this.getBoundMethod(fs.promises.readFile);
    const { error } = await attemptFileOperation<Buffer>(null, func, buffer);
    if (error && operation === "strict") {
      throw error;
    }
    return !error;
  }

  async append(data: string | Buffer, mustExist = false) {
    const buffer: Buffer =
      typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    if (mustExist && !(await this.file())) {
      throw new Error(`Append file target does not exists at ${this._path}`);
    }
    if (operation === "strict" && (await this.folder())) {
      throw new Error(`Cannot write on non-file at ${this._path}`);
    }
    const func = this.getBoundMethod(fs.promises.readFile);
    const { error } = await attemptFileOperation<Buffer>(null, func, buffer);
    if (error && operation === "strict") {
      throw error;
    }
    return !error;
  }

  /**
   * Get a object instance by adding the current path with the provided parameter
   */
  nested(sufix: string) {
    return AsyncFsObj.fromCache(`${this._path}/${sufix}`);
  }

  /**
   * Get an internal object instance even if it does not exist, unless the current instance is a file
   */
  async inside(name: string) {
    const t = await this.type();
    if (t === "file") {
      if (operation === "strict") {
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
 * Attempts a file operation function and handles resource busy errors by retrying once
 *
 * @template A
 * @param fallback The fallback value.
 * @param func The function to be executed.
 * @param args Arguments for the function.
 * @returns Object containing data and error information.
 */
export async function attemptFileOperation<A>(
  fallback: A | undefined | null,
  func: any,
  ...args: any[]
) {
  let error: undefined | Error;
  for (let i = 0; i < 2; i++) {
    try {
      fallback = await func(...args);
      error = undefined;
      break;
    } catch (err: any) {
      error = err;
      if (err.code !== "ENOENT" && err.code !== "EBUSY") {
        break;
      }
    }
    await new Promise((resolve: any) =>
      setTimeout(resolve, Math.floor(100 + 100 * Math.random()))
    );
  }
  return { data: fallback, error };
}

function parseAsyncFsArgs(...args: any[]) {
  const relevant =
    args.length === 3 &&
    typeof args[1] === "number" &&
    args[2] &&
    args[2] instanceof Array &&
    args[2][args[1]] === args[0]
      ? [args[0]]
      : args;
  const problems: { i: number; arg: string }[] = [];
  const parts: string[] = [];
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
