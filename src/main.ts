#!/usr/bin/env node

import { config } from 'dotenv';
import { program } from './cli.js';

// Load environment variables
config({ quiet: true });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nInterrupted. Exiting...');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Run the CLI
program.parse(process.argv);
