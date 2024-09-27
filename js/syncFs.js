import fs from "fs";

const debug = false;

/**
 * @param {any[]} args
 * @returns {'file' | 'folder' | 'unknown'}
 */
export function getPathType(...args) {
  const p = fsPath(...args);
  try {
    const s = fs.statSync(p);
    if (s.isFile()) {
      return "file";
    }
    if (s.isDirectory()) {
      return "folder";
    }
    return "unknown";
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.log("Failed to stat with code", [err.code], "at", [p]);
    }
  }
  return "unknown";
}

/**
 * @param {string} path
 * @param {boolean | undefined | null} [isSync]
 * @returns {(any[] | Error) | Promise<(any[] | Error)>}
 */
function rawPerformList(path, isSync = true) {
  if (isSync) {
    try {
      return fs.readdirSync(path).map((a) => a);
    } catch (err) {
      return err;
    }
  }
  /** @type {any} */
  const result = new Promise((r) => {
    try {
      fs.promises.readdir(path).then(r).catch(r);
    } catch (err) {
      r(err);
    }
  });
  return result;
}

/**
 * @param {string} path
 * @param {'utf-8' | 'text/plain' | 'json' | BufferEncoding | any} [format]
 * @returns {Buffer}
 */
function performSyncRead(path, format = "utf-8") {
  // format
  if (!format) {
    format = "utf-8";
  }
  if (typeof format !== "string" || !format.length) {
    throw new Error(`Unknown format ${JSON.stringify(format)}`);
  }
  format = format.toLowerCase().trim().replace(".", "");

  const txtLike = [
    "",
    "utf-8",
    "utf8",
    "default",
    "text",
    "txt",
    "text/plain",
    "plain/text",
    "html/plain",
    "plain/html",
  ];

  if (
    format === "text/plain" ||
    txtLike.includes(format.trim().replace(".", ""))
  ) {
    format = "utf-8";
  }
  let aux, data;
  aux = format === "json" ? "utf-8" : format ? format : "binary";
  if (["sync", "binary", "buffer", "blob", "raw"].includes(format)) {
    data = fs.readFileSync(path);
  } else if (["json", "utf-8", "utf8"].includes(format)) {
    data = fs.readFileSync(path, "utf-8");
  } else {
    // @ts-ignore
    data = fs.readFileSync(path, aux);
  }
  if (format === "json") {
    try {
      data = data === "" ? null : JSON.parse(data);
    } catch (err) {
      debug && console.log("Failed to parse json file at", path);
      data = err;
    }
  }
  return data;
}

const cache = {};

export function fromFs(...args) {
  if (
    args.length === 3 &&
    typeof args[0] === "string" &&
    typeof args[1] === "number" &&
    typeof args[2] === "object" &&
    args[2] instanceof Array &&
    typeof args[2][0] === "string" &&
    args[2][args[1]] === args[0]
  ) {
    debug &&
      console.log(
        "[fromFs] Call from index",
        args[1],
        "from array of size",
        args[3].length
      );
    args = [args[0]];
  } else {
    debug && console.log("[fromFs] Call with", args.length, "args");
  }
  const p = fsPath(...args);
  if (
    !p ||
    typeof p !== "string" ||
    !p.trim().length ||
    p.includes('"') ||
    p.includes("<") ||
    p.includes(">") ||
    p.includes("*")
  ) {
    throw new Error(`Invalid path: ${JSON.stringify(p)}`);
  }
  debug &&
    console.log(
      `[fromFs] ${
        cache[p] ? "Using cached fs object" : "Creating new fs object"
      } for: ${p.replace(/\\/g, "/")}`
    );
  return cache[p] || (cache[p] = createFsObj(p));
}

export function cacheOrGenerate(cachedObj, generate, maxCacheAge = 100) {
  const now = new Date().getTime();
  const cachedTime =
    cachedObj &&
    typeof cachedObj === "object" &&
    typeof cachedObj.time === "number"
      ? cachedObj.time
      : 0;
  if (
    !cachedObj ||
    (cachedObj && cachedObj instanceof Error) ||
    !cachedTime ||
    isNaN(cachedTime) ||
    typeof maxCacheAge !== "number" ||
    isNaN(maxCacheAge) ||
    maxCacheAge < 0
  ) {
    try {
      const g = generate();
      if (g && g instanceof Promise) {
        throw new Error("Unmplemented generate response");
      }
      return { data: g, time: now };
    } catch (err) {
      return { data: err, time: now };
    }
  }
  const expires = cachedTime + maxCacheAge;
  if (now < expires) {
    return { data: cachedObj.data, time: cachedTime };
  }
  try {
    const g = generate();
    if (g && g instanceof Promise) {
      throw new Error("Unmplemented generate response");
    }
    return { data: g, time: now };
  } catch (err) {
    return { data: err, time: now };
  }
}

function createFsObj(p, u = undefined) {
  if (u !== undefined || (typeof p === "string" && p.length === 0)) {
    throw new Error("Invalid parameter");
  }
  if (
    typeof p === "string" &&
    (p.includes("/undefined") ||
      p.includes("/null") ||
      p.includes("/NaN") ||
      p.includes("undefined/") ||
      p.includes("null/") ||
      p.includes("NaN/"))
  ) {
    throw new Error("Detected malformed path");
  }
  /** @type {any} */
  let obj;
  if (
    typeof p === "object" &&
    p.path &&
    typeof p.write === "function" &&
    typeof p.read === "function"
  ) {
    obj = p;
    debug &&
      console.log("Returning the parameter object that is already initialized");
    return obj;
  }
  obj = {
    path: fsPath(
      typeof p === "object" && typeof p.path === "string" ? p.path : p
    ),
    stat: undefined,
    type: ["unknown", "file", "dir"][0],
  };
  let _hidden;
  _hidden = {};
  const getCachedStat = (maxAge = 100) => {
    const cache = cacheOrGenerate(
      _hidden.stat,
      () => {
        const s = fs.statSync(obj.path);
        return s;
      },
      maxAge
    );
    let d;
    d = cache?.data;
    if (!d || (d instanceof Error && d.code === "ENOENT")) {
      return null;
    }
    _hidden.stat = cache;
    return d;
  };

  const writeFunc = (data, overwrite = false) => {
    const s = getCachedStat(100);
    if (s && s.isDirectory()) {
      console.log("Warning: Invalid write target", obj, s);
    }
    _hidden.data = null;
    const r = writeToFsObj(obj, false, data, overwrite);
    if (r?.size) {
      _hidden.data = null;
      _hidden.stat = null;
    }
    return r;
  };
  const appendFunc = (data, overwrite = false) => {
    const s = getCachedStat(100);
    if (s && s.type !== "file") {
      console.log("Warning: Invalid append target", obj, s);
    }
    const r = writeToFsObj(obj, true, data, overwrite);
    if (r?.size) {
      _hidden.data = null;
      _hidden.stat = null;
    }
    return r;
  };
  const readFunc = () => {
    debug && console.log("[fromFs] readFunc", obj.path);
    const s = obj.stat;
    if (!s || (s && (s.isDirectory() || s instanceof Error))) {
      throw new Error(
        `Invalid fs object target to read method: (${
          s instanceof Error ? s.message : s ? "folder" : "not found"
        })`
      );
    }
    const cache = cacheOrGenerate(_hidden.data, () => {
      const r = performSyncRead(obj.path, "binary");
      if (!(r instanceof Buffer)) {
        throw new Error("Invalid read result");
      }
      return r;
    });
    let d;
    d = cache?.data;
    if (!d || (d instanceof Error && d.code === "ENOENT")) {
      return null;
    }
    _hidden.data = cache;
    return d;
  };

  const getters = {
    name: () => obj.path.split("/").pop(),
    ext: () => (obj.extension || "").replace(".", ""),
    extension: () =>
      obj.name
        .split(".")
        .slice(1)
        .map((a) => `.${a.toLowerCase()}`)
        .pop(),
    parent: () => {
      const l = obj.path.split("/");
      l.pop();
      return fromFs(l.join("/") || "/");
    },
    size: () => getCachedStat(100).size,
    type: () => {
      const s = getCachedStat(100);
      if (!s || !s.isDirectory) {
        return "unknown";
      }
      return s.isFile() ? "file" : "folder";
    },
    stat: () => getCachedStat(33),
    stats: () => getCachedStat(33),
    write: () => {
      return writeFunc;
    },
    append: () => {
      return appendFunc;
    },
    read: () => {
      return readFunc;
    },
    data: () => {
      debug && console.log("[fromFs] data get", obj.path);
      return obj.read();
    },
    text: () => {
      debug && console.log("[fromFs] text get", obj.path);
      return obj.read().toString("utf-8");
    },
    children: () => {
      debug && console.log("[fromFs] children get", obj.path);
      const s = obj.stat;
      if (!s || (s && s instanceof Error)) {
        throw new Error(
          `Invalid fs object stat type to children method: ${
            s ? s.message : "falsy"
          }`
        );
      }
      if (!(s instanceof fs.Stats)) {
        console.log(`obj.stat`, obj.stat);
        throw new Error(
          `Cannot read children when stat is not valid stat o ${obj.path}`
        );
      }
      if (!s.isDirectory()) {
        throw new Error(`Cannot read children of file at ${obj.path}`);
      }
      const cache = cacheOrGenerate(
        _hidden.children,
        () => {
          const r = rawPerformList(obj.path, true);
          if (!(r instanceof Array)) {
            throw new Error("Invalid list result");
          }
          return r.map((p) => fromFs(obj.path, p));
        },
        100
      );
      let d;
      d = cache?.data;
      if (!d || (d instanceof Error && d.code === "ENOENT")) {
        return [];
      }
      _hidden.children = cache;
      return d;
    },
    folders: () => obj.children.filter((f) => f.type !== "file"),
    files: () => obj.children.filter((f) => f.type === "file"),
    folder: () => obj.type === "folder",
    file: () => obj.type === "file",
    exists: () => obj.type !== "unknown",
    create: () => {
      return function createFunc(...args) {
        if (args.length !== 0) {
          throw new Error("Create method does not receive arguments");
        }
        if (obj.type === "folder") {
          debug &&
            console.log(
              "[fromFs] create called on existing directory:",
              obj.path
            );
          return obj;
        }
        if (
          obj.type !== "unknown" ||
          typeof obj.path !== "string" ||
          !obj.path
        ) {
          throw new Error(`Create method called on node of type ${obj.type}`);
        }
        fs.mkdirSync(obj.path);
        _hidden = {};
        return obj;
      };
    },
    mkdir: () => {
      return function mkdirFunc(...args) {
        if (
          args.length !== 1 ||
          typeof args[0] !== "string" ||
          !args[0] ||
          args[0].includes("/") ||
          args[0].includes("<")
        ) {
          throw new Error(
            "Mkdir method does receive 1 string argument: The name of the folder to create"
          );
        }
        if (
          obj.type !== "folder" ||
          typeof obj.path !== "string" ||
          !obj.path
        ) {
          throw new Error(`Create method called on node of type ${obj.type}`);
        }
        fs.mkdirSync(obj.path + "/" + args[0]);
        _hidden.children = undefined;
        return fromFs(obj.path, args[0]);
      };
    },
  };
  for (const key in getters) {
    const d = { get: getters[key] };
    Object.defineProperty(obj, key, d);
    // console.log("key", key, getters[key] instanceof Function);
  }
  if (typeof obj !== "object" || !obj.path || typeof obj.path !== "string") {
    throw new Error("Invalid fs object result");
  }

  const writeOk =
    obj.write &&
    obj.write instanceof Function &&
    typeof obj.write === "function";
  const readOk =
    obj.read && obj.read instanceof Function && typeof obj.read === "function";
  if (!writeOk || !readOk) {
    debug && console.log({ writeOk, readOk });
    throw new Error("Invalid object at assertation:\n");
  }
  return obj;
}

function fsPath(...args) {
  debug && console.log("[fsPath] Call with", args.length, "args");
  try {
    let p = args
      .map((a) =>
        (typeof a === "object" && a instanceof Array
          ? p(...a)
          : typeof a === "object" && typeof a.path === "string"
          ? a.path
          : typeof a === "string"
          ? a
          : JSON.stringify(a)
        ).trim()
      )
      .join("/")
      .replace(/\\/g, "/")
      .replace(/\/\/+/g, "/")
      .replace(/\?/g, "");
    if (p.endsWith("/")) {
      p = p.substring(0, p.length - 1);
    }
    if ([".", "./", "./."].includes(p)) {
      return ".";
    }
    p = p && p instanceof Array ? p.join("/") : p;
    if (p.startsWith("//")) {
      p = p.substring(1);
    }
    if (p.startsWith("./")) {
      p = p.substring(2);
    }
    return p;
  } catch (err) {
    debug && console.log("Failed at fsPath:", err);
    err.message = `Failed to fsPath arguments ${JSON.stringify(args)}: ${
      err.message
    }`;
    throw err;
  }
}

const writeToFsObj = (obj, isAppend = false, value, overwrite = false) => {
  if (
    value === null ||
    value === undefined ||
    (overwrite !== true && overwrite !== false)
  ) {
    throw new Error("Invalid value");
  }
  if (
    value &&
    value instanceof Array &&
    value.length &&
    value.every(
      (v) =>
        typeof v === "string" ||
        typeof v === "number" ||
        (v && v instanceof Buffer)
    )
  ) {
    debug && console.log("Combining", value.length, "buffers to write");
    value = Buffer.concat(
      value.map((v) =>
        v instanceof Buffer
          ? v
          : Buffer.from(typeof v === "string" ? v : JSON.stringify(v))
      )
    );
  } else if (
    value &&
    typeof value === "object" &&
    (value instanceof Error || value instanceof Date)
  ) {
    debug && console.log("Interpreting", "value as handled object");

    value = Buffer.from(
      value instanceof Error
        ? value.stack || value.message || ""
        : value.toISOString()
    );
  } else if (["string", "number", "boolean", "object"].includes(typeof value)) {
    debug && console.log("Interpreting", "value as literal value");

    if (typeof value === "string") {
      value = Buffer.from(value);
    } else if (value && value instanceof Error) {
      value = Buffer.from(
        value.stack || value.message || "" || value.message || ""
      );
    } else {
      value = Buffer.from(JSON.stringify(value));
    }
  }
  if (value && !(value instanceof Buffer)) {
    debug && console.log("Invalid write argument value", { value });
    throw new Error(`Unknown value ${JSON.stringify(value)}`);
  }
  if (typeof obj !== "object" || !obj.type) {
    throw new Error("Unknown write target type");
  }
  if (obj.parent.type === "unknown") {
    debug && console.log("Parent while writing not found at", obj.parent.path);
    if (obj.parent.parent.type === "unknown") {
      console.log("Creating parent parent at", obj.parent.parent.path);
      fs.mkdirSync(obj.parent.parent.path);
    }
    debug && console.log("Creating parent at", obj.parent.path);
    if (obj.parent.type === "unknown") {
      fs.mkdirSync(obj.parent.parent.path);
    }
  } else if (obj.parent.type !== "folder") {
    throw new Error(`Invalid file parent type of ${obj.path}`);
  }
  if (obj.type === "file" && obj.size > 0 && !overwrite && !isAppend) {
    debug && console.log("Not overwritting at", obj.path);
    throw new Error(
      `Write target already exists (overwrite disabled) at ${obj.path}`
    );
  }
  console.log(
    isAppend ? "Appending" : "Writing",
    value.length,
    "bytes to",
    obj.path
  );
  if (isAppend) {
    fs.appendFileSync(obj.path, value);
  } else {
    fs.writeFileSync(obj.path, value);
  }
  return {
    size: (isAppend && obj ? obj.size : 0) + (value.byteLength || value.length),
    buffer: value,
  };
};
