const http = require('http');

const options = {
  hostname: '192.168.1.164',
  port: 80,
  path: '/stats.json',
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost:5173',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'Authorization'
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log('HEADERS:', res.headers);
  if (res.statusCode === 204 && res.headers['access-control-allow-origin'] === '*') {
    console.log('SUCCESS: CORS Preflight passed!');
  } else {
    console.log('FAIL: CORS Preflight Did Not Pass Correctly.');
    process.exit(1);
  }
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  process.exit(1);
});

req.end();