    /* ============================================================
       Systemic Analysis Explorer — interactive toolset for systems theory.
       Supports:
         - Loop Trace (K): Traces feedback loops (R/B) touching focused variable
         - Polarity Lens (Y): Filters positive (+) or negative (-) causal feedback
         - Leverage Meter (G): Highlights Meadows 12 leverage tiers (L1-L3 high leverage)
         - Delay Simulator (D): Animate causal wave propagation with delay latency
         - Actor Perspective (A): Isolates stakeholder alliances and rivalries
         - Layer Drill (I): Cycles through ISM hierarchy (Root -> Trans -> Surface)
       ============================================================ */
    Archify.systemic = (function () {
      var html = document.documentElement;
      var container = document.querySelector('.diagram-container');
      var svg = container ? container.querySelector(':scope > svg') : null;

      // State
      var currentPolarityMode = 'all'; // 'all' | '+' | '-'
      var currentLeverageTier = 'all'; // 'all' | 'high' | 'mid' | 'low'
      var activeLoopId = null;
      var activeLayerIndex = -1;
      var isDelaySimulating = false;

      function getSvg() {
        if (!svg && container) svg = container.querySelector(':scope > svg');
        return svg;
      }

      function showToast(message) {
        var status = document.getElementById('status-chip') || document.querySelector('.status-pill');
        if (status) {
          status.textContent = message;
          status.style.display = 'inline-flex';
          setTimeout(function () {
            if (status.textContent === message) status.style.display = '';
          }, 3200);
        } else {
          console.log('[Archify Systemic]', message);
        }
      }

      // 1. Loop Trace (K)
      function loopTrace() {
        var s = getSvg();
        if (!s) return;

        var loops = Array.prototype.slice.call(s.querySelectorAll('[data-loop-id]'));
        if (loops.length === 0) {
          showToast('当前图表无因果回路标注');
          return;
        }

        // Collect distinct loop IDs
        var loopIds = [];
        loops.forEach(function (el) {
          var id = el.getAttribute('data-loop-id');
          if (id && loopIds.indexOf(id) === -1) loopIds.push(id);
        });

        if (loopIds.length === 0) return;

        if (!activeLoopId) {
          activeLoopId = loopIds[0];
        } else {
          var nextIdx = (loopIds.indexOf(activeLoopId) + 1) % (loopIds.length + 1);
          activeLoopId = nextIdx < loopIds.length ? loopIds[nextIdx] : null;
        }

        if (!activeLoopId) {
          // Clear loop highlighting
          s.removeAttribute('data-active-loop');
          Array.prototype.forEach.call(s.querySelectorAll('[data-loop-member-active]'), function (el) {
            el.removeAttribute('data-loop-member-active');
          });
          showToast('回路追踪已重置 (全部显示)');
          return;
        }

        s.setAttribute('data-active-loop', activeLoopId);

        // Highlight edges and nodes matching this loop
        var memberCount = 0;
        Array.prototype.forEach.call(s.querySelectorAll('[data-edge-from]'), function (edge) {
          var match = edge.getAttribute('data-loop') === activeLoopId;
          if (match) {
            edge.setAttribute('data-loop-member-active', 'true');
            memberCount++;
          } else {
            edge.removeAttribute('data-loop-member-active');
          }
        });

        Array.prototype.forEach.call(s.querySelectorAll('[data-node-id]'), function (node) {
          var loopsAttr = node.getAttribute('data-loops') || '';
          var match = loopsAttr.split(',').indexOf(activeLoopId) >= 0;
          if (match) {
            node.setAttribute('data-loop-member-active', 'true');
          } else {
            node.removeAttribute('data-loop-member-active');
          }
        });

        showToast('追踪回路 [' + activeLoopId + '] · 关联 ' + memberCount + ' 条因果链');
      }

      // 2. Polarity Lens (Y)
      function polarityLens() {
        var s = getSvg();
        if (!s) return;

        if (currentPolarityMode === 'all') currentPolarityMode = '+';
        else if (currentPolarityMode === '+') currentPolarityMode = '-';
        else currentPolarityMode = 'all';

        if (currentPolarityMode === 'all') {
          s.removeAttribute('data-polarity-filter');
          showToast('极性透镜: 显示全部极性因果链');
        } else if (currentPolarityMode === '+') {
          s.setAttribute('data-polarity-filter', '+');
          showToast('极性透镜: 仅高亮正反馈 (+) 增强/同向影响');
        } else {
          s.setAttribute('data-polarity-filter', '-');
          showToast('极性透镜: 仅高亮负反馈 (-) 调节/抑制影响');
        }
      }

      // 3. Leverage Meter (G)
      function leverageMeter() {
        var s = getSvg();
        if (!s) return;

        var tiers = ['all', 'high', 'mid', 'low'];
        var nextIdx = (tiers.indexOf(currentLeverageTier) + 1) % tiers.length;
        currentLeverageTier = tiers[nextIdx];

        if (currentLeverageTier === 'all') {
          s.removeAttribute('data-leverage-filter');
          showToast('梅多斯杠杆: 显示全部干预点 (L1 - L12)');
        } else if (currentLeverageTier === 'high') {
          s.setAttribute('data-leverage-filter', 'high');
          showToast('梅多斯杠杆: 高杠杆解 (L1-L3 范式跃迁与重塑目标)');
        } else if (currentLeverageTier === 'mid') {
          s.setAttribute('data-leverage-filter', 'mid');
          showToast('梅多斯杠杆: 中杠杆解 (L4-L6 信息流疏通与规则重塑)');
        } else {
          s.setAttribute('data-leverage-filter', 'low');
          showToast('梅多斯杠杆: 低杠杆解 (L7-L12 参数微调与补贴)');
        }
      }

      // 4. Delay Simulator (D)
      function delaySimulator() {
        var s = getSvg();
        if (!s || isDelaySimulating) return;

        isDelaySimulating = true;
        s.setAttribute('data-delay-simulation', 'active');
        showToast('启动因果传导与时间延迟推演...');

        var edges = Array.prototype.slice.call(s.querySelectorAll('path[data-edge-from]'));
        edges.forEach(function (edge, i) {
          var hasDelay = Boolean(edge.getAttribute('data-delay'));
          var delayDuration = hasDelay ? 2400 : 800;
          edge.style.transition = 'stroke-dashoffset ' + delayDuration + 'ms ease-in-out';
        });

        setTimeout(function () {
          s.removeAttribute('data-delay-simulation');
          isDelaySimulating = false;
          showToast('因果脉冲与延迟传导推演完成');
        }, 3600);
      }

      // 5. Actor Perspective (A)
      function actorPerspective() {
        var s = getSvg();
        if (!s) return;

        var focused = s.querySelector('[data-focus-selected]') || s.querySelector(':hover');
        var actorNode = focused ? focused.closest('[data-node-id]') : null;

        if (!actorNode) {
          var firstActor = s.querySelector('[data-semantic^="actor-"]') || s.querySelector('[data-node-id]');
          if (firstActor && Archify.focus) {
            var id = firstActor.getAttribute('data-node-id');
            Archify.focus.set(id);
            showToast('已聚焦核心主体 [' + id + '] 利益博弈视角');
          }
          return;
        }

        var actorId = actorNode.getAttribute('data-node-id');
        showToast('聚焦主体博弈视角: ' + (actorNode.getAttribute('aria-label') || actorId));
      }

      // 6. ISM Layer Drill (I)
      function layerDrill() {
        var s = getSvg();
        if (!s) return;

        var layerNames = ['surface', 'transmission', 'root', 'all'];
        activeLayerIndex = (activeLayerIndex + 1) % layerNames.length;
        var selectedLayer = layerNames[activeLayerIndex];

        if (selectedLayer === 'all') {
          s.removeAttribute('data-layer-drill');
          showToast('ISM层级钻取: 显示全景金字塔 (表象 · 传导 · 根源)');
        } else {
          s.setAttribute('data-layer-drill', selectedLayer);
          var titles = {
            surface: 'L1 显性表象层 (Surface Phenomena)',
            transmission: 'L2 机制传导层 (Transmission & Feedback)',
            root: 'L3 根源驱动层 (Root Causes)'
          };
          showToast('ISM层级钻取: 聚焦 ' + titles[selectedLayer]);
        }
      }

      return {
        loopTrace: loopTrace,
        polarityLens: polarityLens,
        leverageMeter: leverageMeter,
        delaySimulator: delaySimulator,
        actorPerspective: actorPerspective,
        layerDrill: layerDrill
      };
    })();
