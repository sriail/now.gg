#!/usr/bin/env node

/**
 * Test script for the bare proxy server
 * Run this to verify the proxy is working correctly
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

console.log('🧪 Bare Proxy Server Test Suite\n');

// Test 1: Health check
function testHealth() {
  return new Promise((resolve, reject) => {
    console.log('1️⃣  Testing health endpoint...');
    
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/health',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'ok') {
            console.log('   ✅ Health check passed');
            console.log(`   📊 Server uptime: ${json.uptime.toFixed(2)}s\n`);
            resolve(true);
          } else {
            console.log('   ❌ Health check failed - unexpected response\n');
            resolve(false);
          }
        } catch (error) {
          console.log('   ❌ Health check failed - invalid JSON\n');
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`   ❌ Health check failed: ${error.message}`);
      console.log(`   💡 Is the server running on ${HOST}:${PORT}?\n`);
      resolve(false);
    });

    req.end();
  });
}

// Test 2: Info endpoint
function testInfo() {
  return new Promise((resolve, reject) => {
    console.log('2️⃣  Testing info endpoint...');
    
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/bare/v1/info',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.server && json.endpoints) {
            console.log('   ✅ Info endpoint passed');
            console.log(`   📊 Server: ${json.server} v${json.version}`);
            console.log(`   📊 Language: ${json.language}\n`);
            resolve(true);
          } else {
            console.log('   ❌ Info endpoint failed - missing fields\n');
            resolve(false);
          }
        } catch (error) {
          console.log('   ❌ Info endpoint failed - invalid JSON\n');
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`   ❌ Info endpoint failed: ${error.message}\n`);
      resolve(false);
    });

    req.end();
  });
}

// Test 3: Static files
function testStatic() {
  return new Promise((resolve, reject) => {
    console.log('3️⃣  Testing static file serving...');
    
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.includes('Now.gg Bare Proxy') && data.includes('<!DOCTYPE html>')) {
          console.log('   ✅ Static files passed');
          console.log('   📊 HTML page loaded successfully\n');
          resolve(true);
        } else {
          console.log('   ❌ Static files failed - unexpected content\n');
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`   ❌ Static files failed: ${error.message}\n`);
      resolve(false);
    });

    req.end();
  });
}

// Test 4: Proxy endpoint (error handling)
function testProxyError() {
  return new Promise((resolve, reject) => {
    console.log('4️⃣  Testing proxy error handling...');
    
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/bare/v1/proxy',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error && json.message && json.message.includes('Missing "url" parameter')) {
            console.log('   ✅ Proxy error handling passed');
            console.log('   📊 Correctly rejects requests without URL parameter\n');
            resolve(true);
          } else {
            console.log('   ❌ Proxy error handling failed - unexpected response\n');
            resolve(false);
          }
        } catch (error) {
          console.log('   ❌ Proxy error handling failed - invalid JSON\n');
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`   ❌ Proxy error handling failed: ${error.message}\n`);
      resolve(false);
    });

    req.end();
  });
}

// Test 5: CORS headers
function testCORS() {
  return new Promise((resolve, reject) => {
    console.log('5️⃣  Testing CORS headers...');
    
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/health',
      method: 'OPTIONS'
    }, (res) => {
      const corsHeaders = {
        'access-control-allow-origin': res.headers['access-control-allow-origin'],
        'access-control-allow-methods': res.headers['access-control-allow-methods'],
        'access-control-allow-headers': res.headers['access-control-allow-headers']
      };

      if (corsHeaders['access-control-allow-origin'] === '*') {
        console.log('   ✅ CORS headers passed');
        console.log('   📊 All required CORS headers present\n');
        resolve(true);
      } else {
        console.log('   ❌ CORS headers failed - missing or incorrect headers\n');
        resolve(false);
      }
    });

    req.on('error', (error) => {
      console.log(`   ❌ CORS headers failed: ${error.message}\n`);
      resolve(false);
    });

    req.end();
  });
}

// Run all tests
async function runTests() {
  const results = [];
  
  results.push(await testHealth());
  results.push(await testInfo());
  results.push(await testStatic());
  results.push(await testProxyError());
  results.push(await testCORS());

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log('='.repeat(50));
  console.log('📊 Test Results');
  console.log('='.repeat(50));
  console.log(`   Passed: ${passed}/${total}`);
  console.log(`   Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('   ✅ All tests passed!\n');
    process.exit(0);
  } else {
    console.log('   ❌ Some tests failed\n');
    process.exit(1);
  }
}

// Check if server is running first
console.log(`🔍 Checking server at ${HOST}:${PORT}...\n`);

const checkReq = http.request({
  hostname: HOST,
  port: PORT,
  path: '/health',
  method: 'GET',
  timeout: 2000
}, () => {
  console.log(`✅ Server is running\n`);
  runTests();
});

checkReq.on('error', (error) => {
  console.log(`❌ Cannot connect to server at ${HOST}:${PORT}`);
  console.log(`   Error: ${error.message}`);
  console.log(`\n💡 Please start the server first:`);
  console.log(`   npm start\n`);
  process.exit(1);
});

checkReq.end();
