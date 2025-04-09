// This script will help identify and kill processes using port 3000
// Run this with: node fix-port.js

const { exec } = require('child_process');

console.log('Checking for processes using port 3000...');

// For Windows
if (process.platform === 'win32') {
  exec('netstat -ano | findstr :3000', (error, stdout, stderr) => {
    if (error) {
      console.log('No processes found using port 3000.');
      return;
    }
    
    console.log('Processes using port 3000:');
    console.log(stdout);
    
    const lines = stdout.trim().split('\n');
    if (lines.length > 0) {
      // Extract PIDs from the output
      const pids = new Set();
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          pids.add(parts[4]);
        }
      });
      
      console.log('\nTo kill these processes, run the following commands:');
      pids.forEach(pid => {
        console.log(`taskkill /F /PID ${pid}`);
      });
    }
  });
} else {
  // For Unix-based systems (Linux, macOS)
  exec('lsof -i :3000', (error, stdout, stderr) => {
    if (error) {
      console.log('No processes found using port 3000.');
      return;
    }
    
    console.log('Processes using port 3000:');
    console.log(stdout);
    
    const lines = stdout.trim().split('\n').slice(1); // Skip header
    if (lines.length > 0) {
      // Extract PIDs from the output
      const pids = new Set();
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          pids.add(parts[1]);
        }
      });
      
      console.log('\nTo kill these processes, run the following commands:');
      pids.forEach(pid => {
        console.log(`kill -9 ${pid}`);
      });
    }
  });
}
