import { Command } from 'commander';
import * as commands from './commands/index.js';
export const program = new Command();
program
    .name('action-failure-analyzer')
    .description('CLI for analyzing failed GitHub Actions workflow runs')
    .version('1.0.0');
// Register all commands
commands.analyze.register(program);
commands.list.register(program);
commands.testOpencode.register(program);
// Default action shows help
program.action(() => {
    program.help();
});
//# sourceMappingURL=cli.js.map