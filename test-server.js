#!/usr/bin/env node

/**
 * Test script for the bare proxy server
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

console.log('Bare Proxy Server Test Suite\n');

// Test 1: Health check
function testHealth() {
    return new Promise((resolve) => {
        console.log('1. Testing health endpoint...');

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
                        console.log('   OK - Health check passed\n');
                        resolve(true);
                    } else {
                        console.log('   FAIL - Unexpected response\n');
                        resolve(false);
                    }
                } catch (error) {
                    console.log('   FAIL - Invalid JSON\n');
                    resolve(false);
                }
            });
        });

        req.on('error', (error) => {
            console.log(`   FAIL: ${error.message}\n`);
            resolve(false);
        });

        req.end();
    });
}

// Test 2: Info endpoint
function testInfo() {
    return new Promise((resolve) => {
        console.log('2. Testing info endpoint...');

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
                        console.log('   OK - Info endpoint passed\n');
                        resolve(true);
                    } else {
                        console.log('   FAIL - Missing fields\n');
                        resolve(false);
                    }
                } catch (error) {
                    console.log('   FAIL - Invalid JSON\n');
                    resolve(false);
                }
            });
        });

        req.on('error', (error) => {
            console.log(`   FAIL: ${error.message}\n`);
            resolve(false);
        });

        req.end();
    });
}

// Test 3: Static files
function testStatic() {
    return new Promise((resolve) => {
        console.log('3. Testing static file serving...');

        const req = http.request({
            hostname: HOST,
            port: PORT,
            path: '/',
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data.includes('<!DOCTYPE html>')) {
                    console.log('   OK - Static files passed\n');
                    resolve(true);
                } else {
                    console.log('   FAIL - Unexpected content\n');
                    resolve(false);
                }
            });
        });

        req.on('error', (error) => {
            console.log(`   FAIL: ${error.message}\n`);
            resolve(false);
        });

        req.end();
    });
}

// Test 4: Proxy endpoint error handling
function testProxyError() {
    return new Promise((resolve) => {
        console.log('4. Testing proxy error handling...');

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
                        console.log('   OK - Proxy error handling passed\n');
                        resolve(true);
                    } else {
                        console.log('   FAIL - Unexpected response\n');
                        resolve(false);
                    }
                } catch (error) {
                    console.log('   FAIL - Invalid JSON\n');
                    resolve(false);
                }
            });
        });

        req.on('error', (error) => {
            console.log(`   FAIL: ${error.message}\n`);
            resolve(false);
        });

        req.end();
    });
}

// Test 5: CORS headers
function testCORS() {
    return new Promise((resolve) => {
        console.log('5. Testing CORS headers...');

        const req = http.request({
            hostname: HOST,
            port: PORT,
            path: '/health',
            method: 'OPTIONS'
        }, (res) => {
            if (res.headers['access-control-allow-origin'] === '*') {
                console.log('   OK - CORS headers passed\n');
                resolve(true);
            } else {
                console.log('   FAIL - Missing CORS headers\n');
                resolve(false);
            }
        });

        req.on('error', (error) => {
            console.log(`   FAIL: ${error.message}\n`);
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

    console.log('='.repeat(40));
    console.log('Test Results');
    console.log('='.repeat(40));
    console.log(`Passed: ${passed}/${total}`);

    if (passed === total) {
        console.log('All tests passed!\n');
        process.exit(0);
    } else {
        console.log('Some tests failed\n');
        process.exit(1);
    }
}

// Check if server is running first
console.log(`Checking server at ${HOST}:${PORT}...\n`);

const checkReq = http.request({
    hostname: HOST,
    port: PORT,
    path: '/health',
    method: 'GET',
    timeout: 2000
}, () => {
    console.log(`Server is running\n`);
    runTests();
});

checkReq.on('error', (error) => {
    console.log(`Cannot connect to server at ${HOST}:${PORT}`);
    console.log(`Error: ${error.message}`);
    console.log(`\nPlease start the server first: npm start\n`);
    process.exit(1);
});

checkReq.end();
