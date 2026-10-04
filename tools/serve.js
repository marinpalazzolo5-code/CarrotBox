// Minimal static file server for local testing:  node tools/serve.js [port]
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".wav": "audio/wav" };
function serve(port) {
	const server = http.createServer((req, res) => {
		let file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
		if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
		if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
		fs.readFile(file, (err, data) => {
			if (err) { res.writeHead(404); return res.end("not found"); }
			res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
			res.end(data);
		});
	});
	return new Promise(resolve => server.listen(port, () => resolve(server)));
}
module.exports = serve;
if (require.main === module) serve(+process.argv[2] || 8123).then(() => console.log("CarrotBox on http://localhost:" + (+process.argv[2] || 8123) + "/"));
