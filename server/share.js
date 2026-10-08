/**
 * 게임 서버 + Cloudflare 터널을 한 번에 켜고, 외부에서 접속할 주소를 출력합니다.
 * 실행: npm run share   (끄기: Ctrl + C)
 *
 * - 이미 3000번 포트에서 서버가 돌고 있으면 그 서버를 그대로 씁니다.
 * - 계정 없이 쓰는 임시 터널(Quick Tunnel)이라 켤 때마다 주소가 바뀝니다.
 * - 이 PC가 켜져 있고 이 창이 열려 있는 동안만 접속됩니다.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const children = [];

// cloudflared 위치: PATH에 있으면 그대로, 없으면 winget 기본 설치 경로
function findCloudflared() {
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  return candidates.find((p) => fs.existsSync(p)) || 'cloudflared';
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function shutdown() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  if (await portInUse(PORT)) {
    console.log(`[share] ${PORT}번 포트에서 이미 서버가 실행 중이라 그 서버를 씁니다.`);
  } else {
    const server = spawn(process.execPath, [path.join(__dirname, 'index.js'), ...process.argv.slice(2)], { stdio: 'inherit' });
    server.on('exit', (code) => {
      console.log(`[share] 게임 서버가 종료됐습니다 (코드 ${code}).`);
      shutdown();
    });
    children.push(server);
  }

  const tunnel = spawn(findCloudflared(), ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
  children.push(tunnel);
  tunnel.on('error', () => {
    console.log('[share] cloudflared를 찾을 수 없습니다. 설치: winget install --id Cloudflare.cloudflared');
    shutdown();
  });
  tunnel.on('exit', (code) => {
    console.log(`[share] 터널이 종료됐습니다 (코드 ${code}).`);
    shutdown();
  });

  // cloudflared는 접속 주소를 stderr 로그에 찍음
  let announced = false;
  tunnel.stderr.on('data', (chunk) => {
    const match = !announced && chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!match) return;
    announced = true;
    console.log('\n========================================================');
    console.log('  외부 접속 주소 (친구에게 보내세요)');
    console.log(`  ${match[0]}`);
    console.log('  끄려면 이 창에서 Ctrl + C');
    console.log('========================================================\n');
  });
}

main();
