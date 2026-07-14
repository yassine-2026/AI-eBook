const http = require('http');
const data = JSON.stringify({
  topic: "The History of Rome",
  genre: "history",
  chapters: 3,
  language: "english",
  author: "John Doe",
  max_pages: 10
});
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/generate-book',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};
const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});
req.on('error', error => {
  console.error(error);
});
req.write(data);
req.end();
