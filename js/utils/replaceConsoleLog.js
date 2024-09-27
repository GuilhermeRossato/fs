export function replaceConsoleLog(method = 'log') {
  const cwd = process.cwd().replace(/\\/g, '/');
  let cl = console[method];

  console[method] = (...args) => {
    try {
      const parsed = getCurrentStackList();
      if (
        parsed &&
        parsed[0] &&
        parsed[0].source &&
        parsed[0].source.includes(replaceConsoleLog.name)
      ) {
        parsed.shift();
      } else {
        cl.call(console, `[replaceConsoleLog] Error`, { parsed, args });
        process.exit(1);
      }
      if (
        parsed &&
        parsed[0] &&
        parsed[0].source &&
        parsed[0].source.includes(replaceConsoleLog.name)
      ) {
        cl.call(console, `[replaceConsoleLog] Error`, { parsed, args });
        process.exit(1);
      }
      let srcFile = parsed[0].source.replace(/\\/g, '/');
      const i = srcFile.indexOf(cwd);
      if (i !== -1) {
        srcFile = '.'+srcFile.substring(i + cwd.length);
      }
      
      const dateStr = new Date(new Date().getTime() - 3 * 60 * 60 * 1000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "");
      args.unshift(`[${dateStr.substring(0, 19)}] ${srcFile} -`);
    } catch (err) {
      cl.call(console, "\nFailed at logging:", err, "\n");
    }
    cl.call(console, ...args);
  };
}

function getCurrentStackList() {
  const text = new Error("a").stack.replace(/\\/g, "/").replace(/\r\n/g, "\n");
  const i = 0;
  return text
    .substring(text.indexOf("\n", i + 1) + 1)
    .split("\n")
    .map((line) =>
      line.includes(".js") || line.includes(".cjs") || line.includes(".mjs")
        ? line.replace(/\)/g, "").trim()
        : ""
    )
    .filter((a) => a.length && !a.includes(getCurrentStackList.name))
    .map((line) => line.substring(line.indexOf("at ") + 3).split("("))
    .map((parts) => {
      const srcs = (parts[parts.length - 1] || "").split("/");
      const last = srcs[srcs.length - 1];
      if (last && last.split(":").length === 3) {
        srcs[srcs.length - 1] = last.substring(0, last.lastIndexOf(":"));
      }
      return {
        source: srcs.join("/"),
        method: parts.length === 2 ? parts[0].trim() : "",
      };
    });
}
