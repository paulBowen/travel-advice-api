const fs = require("fs");

try {
    var settings = JSON.parse(fs.readFileSync("./settings.json", "utf8"));
}
catch (e) {
    throw new Error(`Settings file could not be parsed due to ${e.name}:${e.message}`);
}

if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) {
    throw new Error("Non-integer or invalid port number specified in settings file");
}

if (!settings.baseURL) {
    throw new Error("No base URL specified in settings file");
}

module.exports = settings;