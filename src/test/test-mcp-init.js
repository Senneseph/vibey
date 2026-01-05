/**
 * Diagnostic script to test MCP server initialization
 * Run this to see if the built-in servers can be started
 */

const path = require('path');
const { spawn } = require('child_process');

console.log('=== MCP Server Initialization Diagnostic ===\n');

// Test 1: Check if OpenSpec server file exists
const openspecPath = path.join(__dirname, 'openspec-server', 'build', 'index.js');
const filesystemPath = path.join(__dirname, 'src', 'agent', 'mcp', 'filesystem_mcp_server.js');

console.log('1. Checking server files...');
console.log(`   OpenSpec server: ${openspecPath}`);
console.log(`   Filesystem server: ${filesystemPath}`);

const fs = require('fs');
const openspecExists = fs.existsSync(openspecPath);
const filesystemExists = fs.existsSync(filesystemPath);

console.log(`   OpenSpec exists: ${openspecExists}`);
console.log(`   Filesystem exists: ${filesystemExists}\n`);

if (!openspecExists) {
    console.error('❌ OpenSpec server file not found!');
    console.log('   Run: npm run build:openspec\n');
}

if (!filesystemExists) {
    console.error('❌ Filesystem server file not found!');
    console.log('   The TypeScript file should be compiled to JS\n');
}

// Test 2: Try to start OpenSpec server
if (openspecExists) {
    console.log('2. Testing OpenSpec server startup...');
    const openspecProc = spawn(process.execPath, [openspecPath], {
        env: { ...process.env, NODE_ENV: 'production' }
    });

    let openspecOutput = '';
    let openspecError = '';

    openspecProc.stdout.on('data', (data) => {
        openspecOutput += data.toString();
    });

    openspecProc.stderr.on('data', (data) => {
        openspecError += data.toString();
    });

    setTimeout(() => {
        openspecProc.kill();
        console.log('   OpenSpec stdout:', openspecOutput || '(none)');
        console.log('   OpenSpec stderr:', openspecError || '(none)');
        
        if (openspecError.includes('Enhanced OpenSpec MCP server running')) {
            console.log('   ✅ OpenSpec server started successfully\n');
        } else if (openspecError || openspecOutput) {
            console.log('   ⚠️  OpenSpec server produced output but may not have started correctly\n');
        } else {
            console.log('   ❌ OpenSpec server did not produce expected output\n');
        }

        // Test 3: Try to start Filesystem server
        if (filesystemExists) {
            console.log('3. Testing Filesystem server startup...');
            const filesystemProc = spawn(process.execPath, [filesystemPath], {
                env: { 
                    ...process.env, 
                    NODE_ENV: 'production',
                    VIBEY_WORKSPACE_ROOT: __dirname
                }
            });

            let filesystemOutput = '';
            let filesystemError = '';

            filesystemProc.stdout.on('data', (data) => {
                filesystemOutput += data.toString();
            });

            filesystemProc.stderr.on('data', (data) => {
                filesystemError += data.toString();
            });

            setTimeout(() => {
                filesystemProc.kill();
                console.log('   Filesystem stdout:', filesystemOutput || '(none)');
                console.log('   Filesystem stderr:', filesystemError || '(none)');
                
                if (filesystemError.includes('Filesystem MCP server running')) {
                    console.log('   ✅ Filesystem server started successfully\n');
                } else if (filesystemError || filesystemOutput) {
                    console.log('   ⚠️  Filesystem server produced output but may not have started correctly\n');
                } else {
                    console.log('   ❌ Filesystem server did not produce expected output\n');
                }

                console.log('=== Diagnostic Complete ===');
                console.log('\nIf servers are not starting:');
                console.log('1. Check Extension Host output in VS Code (View > Output > Extension Host)');
                console.log('2. Look for [MCP] log messages during extension activation');
                console.log('3. Check if there are any permission errors or missing dependencies');
            }, 2000);
        }
    }, 2000);
} else {
    console.log('\n=== Diagnostic Complete ===');
    console.log('Cannot test server startup - server files missing');
}

