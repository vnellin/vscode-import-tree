const vscode = require('vscode');

let currentPanel = undefined;

function getNonce() {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 64; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function getHtmlForWebview(webview, graphData) {
  const nonce = getNonce();
  const cspSource = webview.cspSource;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Import Tree</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      overflow: hidden;
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
    }
    #toolbar span { font-size: 13px; color: #969696; }
    #toolbar strong { color: #d4d4d4; }
    #canvas-container {
      position: fixed;
      top: 42px;
      left: 0;
      right: 0;
      bottom: 0;
    }
    #canvas-container canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .legend {
      position: fixed;
      bottom: 16px;
      left: 16px;
      background: rgba(37, 37, 38, 0.92);
      border: 1px solid #3c3c3c;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 12px;
      z-index: 50;
    }
    .legend-item { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    .legend-dot.unused { background: #f14c4c; }
    .legend-dot.used { background: #4ec9b0; }
    .legend-dot.entry { background: #569cd6; }
    #tooltip {
      position: fixed;
      background: #252526;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      padding: 8px 12px;
      font-size: 12px;
      pointer-events: none;
      display: none;
      z-index: 200;
      max-width: 400px;
      line-height: 1.5;
    }
    #tooltip .file { color: #d4d4d4; }
    #tooltip .info { color: #969696; }
  </style>
</head>
<body>
  <div id="toolbar">
    <span>Nodes: <strong id="nodeCount">0</strong></span>
    <span>Edges: <strong id="edgeCount">0</strong></span>
    <span>Unused: <strong id="unusedCount" style="color:#f14c4c">0</strong></span>
  </div>
  <div id="canvas-container">
    <canvas id="graphCanvas"></canvas>
  </div>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot used"></div> Used</div>
    <div class="legend-item"><div class="legend-dot unused"></div> Unused</div>
    <div class="legend-item"><div class="legend-dot entry"></div> Entry (index)</div>
  </div>
  <div id="tooltip"></div>

  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const graphData = ${JSON.stringify(graphData)};
    renderGraph(graphData);

    function renderGraph(data) {
      const container = document.getElementById('canvas-container');
      const canvas = document.getElementById('graphCanvas');
      const ctx = canvas.getContext('2d');
      const tooltip = document.getElementById('tooltip');

      document.getElementById('nodeCount').textContent = data.nodes.length;
      document.getElementById('edgeCount').textContent = data.edges.length;
      document.getElementById('unusedCount').textContent = data.unused.length;

      let width, height;

      function resize() {
        const rect = container.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.scale(devicePixelRatio, devicePixelRatio);
      }
      resize();
      window.addEventListener('resize', resize);

      const unusedSet = new Set(data.unused);
      const nodeMap = new Map();
      const nodes = data.nodes.map((p, i) => {
        const isUnused = unusedSet.has(p);
        const basename = p.split(/[\\\\/]/).pop();
        const isEntry = /^index\\./.test(basename);
        const n = {
          id: i,
          path: p,
          label: getShortPath(p, data.nodes),
          x: Math.random() * width * 0.6 + width * 0.2,
          y: Math.random() * height * 0.6 + height * 0.2,
          vx: 0, vy: 0,
          r: isUnused ? 6 : 5,
          color: isUnused ? '#f14c4c' : (isEntry ? '#569cd6' : '#4ec9b0'),
          isUnused,
        };
        nodeMap.set(p, n);
        return n;
      });

      const edges = data.edges.filter(e => nodeMap.has(e.from) && nodeMap.has(e.to));

      function getShortPath(fp, allPaths) {
        const parts = fp.split(/[\\\\/]/);
        const name = parts.pop();
        const dir = parts.pop() || '';
        return dir ? dir + '/' + name : name;
      }

      let hoveredNode = null;
      let dragNode = null;
      let dragOffset = { x: 0, y: 0 };

      function getNodeAt(mx, my) {
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          const dx = mx - n.x;
          const dy = my - n.y;
          const r = Math.max(n.r, 10);
          if (dx * dx + dy * dy < r * r) return n;
        }
        return null;
      }

      canvas.addEventListener('mousedown', (e) => {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const n = getNodeAt(mx, my);
        if (n) {
          dragNode = n;
          dragOffset.x = mx - n.x;
          dragOffset.y = my - n.y;
        }
      });

      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;

        if (dragNode) {
          dragNode.x = mx - dragOffset.x;
          dragNode.y = my - dragOffset.y;
          return;
        }

        const n = getNodeAt(mx, my);
        hoveredNode = n;
        if (n) {
          canvas.style.cursor = 'pointer';
          let info = [];
          const edgeCount = edges.filter(e => e.from === n.path).length;
          const importedByCount = data.nodes.filter(p => data.edges.some(e => e.to === n.path && e.from === p)).length;
          info.push(n.label);
          info.push('Exports: ' + edgeCount + ' imports to other files');
          info.push('Imported by: ' + importedByCount + ' files');
          if (n.isUnused) info.push('UNUSED - no other file imports this');
          tooltip.innerHTML = info.map(l => '<div>' + l + '</div>').join('');
          tooltip.style.display = 'block';
          tooltip.style.left = Math.min(mx + 12, width - tooltip.offsetWidth - 10) + 'px';
          tooltip.style.top = Math.min(my + 12, height - tooltip.offsetHeight - 10) + 'px';
        } else {
          canvas.style.cursor = 'default';
          tooltip.style.display = 'none';
        }
      });

      canvas.addEventListener('mouseup', () => { dragNode = null; });
      canvas.addEventListener('mouseleave', () => {
        dragNode = null;
        hoveredNode = null;
        tooltip.style.display = 'none';
      });

      canvas.addEventListener('dblclick', (e) => {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const n = getNodeAt(mx, my);
        if (n) {
          vscodeApi.postMessage({ type: 'openFile', path: n.path });
        }
      });

      function simulate() {
        const REPULSION = 8000;
        const ATTRACTION = 0.005;
        const DAMPING = 0.9;
        const CENTER_GRAVITY = 0.01;
        const cx = width / 2;
        const cy = height / 2;

        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            let force = REPULSION / (dist * dist);
            let fx = (dx / dist) * force;
            let fy = (dy / dist) * force;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }

          a.vx += (cx - a.x) * CENTER_GRAVITY;
          a.vy += (cy - a.y) * CENTER_GRAVITY;
        }

        for (const edge of edges) {
          const a = nodeMap.get(edge.from);
          const b = nodeMap.get(edge.to);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 100) * ATTRACTION;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }

        for (const n of nodes) {
          if (n === dragNode) continue;
          n.vx *= DAMPING;
          n.vy *= DAMPING;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(20, Math.min(width - 20, n.x));
          n.y = Math.max(20, Math.min(height - 20, n.y));
          if (Math.abs(n.vx) < 0.01) n.vx = 0;
          if (Math.abs(n.vy) < 0.01) n.vy = 0;
        }
      }

      function draw() {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, width, height);

        for (const edge of edges) {
          const a = nodeMap.get(edge.from);
          const b = nodeMap.get(edge.to);
          if (!a || !b) continue;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = 'rgba(212, 212, 212, 0.12)';
          ctx.lineWidth = 1;
          ctx.stroke();

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            const ux = dx / dist;
            const uy = dy / dist;
            const size = 5;
            const tipX = b.x - ux * (b.r + 3);
            const tipY = b.y - uy * (b.r + 3);
            const baseX = tipX - ux * size;
            const baseY = tipY - uy * size;
            const perpX = -uy * size * 0.5;
            const perpY = ux * size * 0.5;
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(baseX + perpX, baseY + perpY);
            ctx.lineTo(baseX - perpX, baseY - perpY);
            ctx.closePath();
            ctx.fillStyle = 'rgba(212, 212, 212, 0.2)';
            ctx.fill();
          }
        }

        for (const n of nodes) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = n === hoveredNode ? lightenColor(n.color, 30) : n.color;
          ctx.fill();
          if (n === hoveredNode) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.fillStyle = '#969696';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y + n.r + 12);
        }
      }

      function lightenColor(hex, amt) {
        let c = parseInt(hex.slice(1), 16);
        let r = Math.min(255, (c >> 16) + amt);
        let g = Math.min(255, ((c >> 8) & 0x00FF) + amt);
        let b = Math.min(255, (c & 0x0000FF) + amt);
        return '#' + (1 << 16 | r << 8 | g << 8 | b).toString(16).slice(1);
      }

      let frame;
      let tick = 0;
      const MAX_TICKS = 300;

      function loop() {
        if (tick < MAX_TICKS || dragNode) {
          simulate();
          tick++;
        }
        draw();
        frame = requestAnimationFrame(loop);
      }
      loop();
    }
  </script>
</body>
</html>`;
}

function showGraph(context, graphData) {
  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = undefined;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'importTree.graph',
    'Import Tree — Dependency Graph',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );



  currentPanel.webview.html = getHtmlForWebview(currentPanel.webview, graphData);

  currentPanel.webview.onDidReceiveMessage((message) => {
    if (message.type === 'openFile') {
      vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path));
    }
  });

  currentPanel.onDidDispose(() => { currentPanel = undefined; });
}

module.exports = { showGraph };
