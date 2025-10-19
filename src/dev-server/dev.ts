const processes: Bun.Subprocess[] = [];

function spawn(name: string, cmd: string, args: string[]) {
  const proc = Bun.spawn({
    cmd: [cmd, ...args],
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  processes.push(proc);
  proc.exited.then((code) => {
    // On exit of one, terminate the other
    for (const p of processes) {
      if (!p.killed) {
        try { 
          p.kill(); 
        } catch {
          // Ignore kill errors
        }
      }
    }
    process.exit(code ?? 0);
  });
}

spawn('backend', 'bun', ['--watch', 'src/dev-server/devServer.ts']);
spawn('frontend', 'bun', ['x', 'vite', '--port', '5000']);