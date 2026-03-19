/**
 * Timeline 蓝军测试
 * 在浏览器 console 运行，直接操作 Pinia stores
 * 
 * 用法：粘贴到 console 执行
 */
(function timelineBlueTeam() {
  // 获取 Pinia stores
  const app = document.querySelector('#app').__vue_app__
  const pinia = app.config.globalProperties.$pinia

  // 从 pinia 获取 store instances
  // Pinia stores 需要通过 useStore() 调用，但我们可以直接访问 state
  const timelineState = pinia.state.value.timeline
  const canvasState = pinia.state.value.canvas

  // 获取 store 实例的方法：通过 _s Map
  const timelineStore = pinia._s.get('timeline')
  const canvasStore = pinia._s.get('canvas')

  if (!timelineStore || !canvasStore) {
    console.error('❌ Stores not found')
    return
  }

  const results = []
  let testCount = 0
  let passCount = 0

  function assert(condition, msg) {
    testCount++
    if (condition) {
      passCount++
      results.push(`  ✅ ${msg}`)
    } else {
      results.push(`  ❌ ${msg}`)
    }
  }

  function section(name) {
    results.push(`\n## ${name}`)
  }

  function reset() {
    timelineStore.reset()
    canvasStore.cards.clear()
    canvasStore.depthLevel = 0
    canvasStore.currentRoundDepth = -1
    canvasStore.currentRoundIds = new Set()
    canvasStore.selectedIds = new Set()
    canvasStore.greetingVisible = true
  }

  function simulateRound(userMsg, cards, commands = [], fromParent = null) {
    // If fromParent is specified, create node from that parent (explicit branch)
    // Otherwise, use normal send flow (always from activeTip)
    let parentId, nodeId
    if (fromParent !== null) {
      // Explicit branch — for testing tree structure
      nodeId = timelineStore.createNode(fromParent, userMsg)
    } else {
      parentId = timelineStore.getBranchPoint()
      nodeId = timelineStore.branchFrom(parentId, userMsg)
    }
    
    // Record push
    timelineStore.addOperation(nodeId, { op: 'push' })
    
    // Create cards
    canvasStore.beginRound()
    cards.forEach((c, i) => {
      const cardId = canvasStore.addCard(c.type, c.data, i)
      const card = canvasStore.cards.get(cardId)
      if (card) {
        timelineStore.addOperation(nodeId, {
          op: 'create',
          card: {
            id: card.id,
            type: card.type,
            data: { ...card.data },
            x: card.x, y: card.y, z: card._targetZ ?? card.z,
            w: card.w, zIndex: card.zIndex, intraZ: card.intraZ,
            contentKey: card.contentKey,
          }
        })
      }
    })

    // Execute commands
    commands.forEach(cmd => {
      // Find matching cards BEFORE execution (title may change after update)
      const target = (cmd.title || '').toLowerCase()
      const matchedIds = []
      canvasStore.cards.forEach(card => {
        const title = (card.data.title || '').toLowerCase()
        if (title.includes(target)) matchedIds.push(card.id)
      })

      // Execute on canvas (handles newTitle→title etc.)
      canvasStore.executeCommand(cmd)

      // Record in timeline from card's actual state after execution
      matchedIds.forEach(cardId => {
        const card = canvasStore.cards.get(cardId)
        if (!card) return
        if (cmd.cmd === 'move') {
          timelineStore.addOperation(nodeId, {
            op: 'move', cardId: card.id,
            to: { x: card.x, y: card.y, z: card.z }
          })
        } else if (cmd.cmd === 'update') {
          timelineStore.addOperation(nodeId, {
            op: 'update', cardId: card.id, changes: { ...card.data }
          })
        }
      })
    })

    return nodeId
  }

  function getComputedCardTitles(nodeId) {
    const computed = timelineStore.computeCanvas(nodeId)
    return [...computed.values()].map(c => c.data.title || '(no title)').sort()
  }

  function getComputedCardPositions(nodeId) {
    const computed = timelineStore.computeCanvas(nodeId)
    const pos = {}
    computed.forEach(c => { pos[c.data.title || c.id] = { x: c.x, y: c.y } })
    return pos
  }

  // ═══════════════════════════════════════════
  // T1: 基础线性 A→B→C→D
  // ═══════════════════════════════════════════
  section('T1: 基础线性 A→B→C→D')
  reset()

  const a = simulateRound('你好', [{ type: 'card', data: { title: 'Hello', x: 50, y: 30 } }])
  const b = simulateRound('推荐电影', [
    { type: 'card', data: { title: 'Her', x: 20, y: 30 } },
    { type: 'card', data: { title: 'Interstellar', x: 50, y: 30 } },
  ])
  const c = simulateRound('天气', [{ type: 'card', data: { title: '北京天气', x: 50, y: 30 } }])
  const d = simulateRound('新闻', [{ type: 'card', data: { title: '今日新闻', x: 50, y: 30 } }])

  assert(timelineStore.nodes.size === 4, `4 nodes created (got ${timelineStore.nodes.size})`)

  // Navigate up to A
  timelineStore.viewingId = d
  timelineStore.navigate('up') // C
  timelineStore.navigate('up') // B
  timelineStore.navigate('up') // A

  assert(timelineStore.viewingId === a, `Viewing A after 3x up (got ${timelineStore.viewingId})`)

  const aCards = getComputedCardTitles(a)
  assert(aCards.length === 1 && aCards[0] === 'Hello', `A has only Hello (got ${aCards})`)

  // Navigate down to D
  timelineStore.navigate('down') // B
  timelineStore.navigate('down') // C
  timelineStore.navigate('down') // D

  assert(timelineStore.viewingId === d, `Viewing D after 3x down`)

  const dCards = getComputedCardTitles(d)
  assert(dCards.includes('今日新闻'), `D has 今日新闻`)

  // ═══════════════════════════════════════════
  // T2: 分支基础 A→B, A→C
  // ═══════════════════════════════════════════
  section('T2: 分支基础 A→B, A→C')
  reset()

  const t2a = simulateRound('起点', [{ type: 'card', data: { title: '起点卡片', x: 50, y: 30 } }])
  const t2b = simulateRound('路线B', [{ type: 'card', data: { title: 'B内容', x: 30, y: 30 } }])

  // Explicit branch from A (not normal send — that would go from activeTip)
  const t2c = simulateRound('路线C', [{ type: 'card', data: { title: 'C内容', x: 70, y: 30 } }], [], t2a)

  const nodeA = timelineStore.nodes.get(t2a)
  assert(nodeA.childIds.length === 2, `A has 2 children (got ${nodeA.childIds.length})`)
  assert(nodeA.childIds.includes(t2b) && nodeA.childIds.includes(t2c), 'A children are B and C')

  // Switch between siblings
  timelineStore.viewingId = t2b
  const bTitles = getComputedCardTitles(t2b)
  assert(bTitles.includes('B内容'), `B branch has B内容`)

  timelineStore.navigate('right') // → C
  assert(timelineStore.viewingId === t2c, `Right goes to C`)
  const cTitles = getComputedCardTitles(t2c)
  assert(cTitles.includes('C内容'), `C branch has C内容`)
  assert(!cTitles.includes('B内容'), `C branch does NOT have B内容`)

  timelineStore.navigate('left') // ← B
  assert(timelineStore.viewingId === t2b, `Left goes back to B`)

  // ═══════════════════════════════════════════
  // T3: 深度分支 A→B→C, A→B→D
  // ═══════════════════════════════════════════
  section('T3: 深度分支 A→B→C, A→B→D')
  reset()

  const t3a = simulateRound('根', [{ type: 'card', data: { title: '根卡', x: 50, y: 30 } }])
  const t3b = simulateRound('分支点', [{ type: 'card', data: { title: '分支卡', x: 40, y: 30 } }])
  const t3c = simulateRound('左路', [{ type: 'card', data: { title: '左路卡', x: 20, y: 30 } }])

  // Explicit branch from B to D
  const t3d = simulateRound('右路', [{ type: 'card', data: { title: '右路卡', x: 80, y: 30 } }], [], t3b)

  const nodeB3 = timelineStore.nodes.get(t3b)
  assert(nodeB3.childIds.length === 2, `B has 2 children (C and D)`)

  // C should have 根卡 (decayed) + 分支卡 (decayed) + 左路卡
  const cCards3 = timelineStore.computeCanvas(t3c)
  assert(cCards3.size >= 1, `C has at least 左路卡 (got ${cCards3.size})`)
  const cHasLeft = [...cCards3.values()].some(c => c.data.title === '左路卡')
  assert(cHasLeft, `C has 左路卡`)

  // D should have 根卡 (decayed) + 分支卡 (decayed) + 右路卡
  const dCards3 = timelineStore.computeCanvas(t3d)
  const dHasRight = [...dCards3.values()].some(c => c.data.title === '右路卡')
  assert(dHasRight, `D has 右路卡`)
  const dHasLeft3 = [...dCards3.values()].some(c => c.data.title === '左路卡')
  assert(!dHasLeft3, `D does NOT have 左路卡`)

  // ═══════════════════════════════════════════
  // T4: Move + 分支
  // ═══════════════════════════════════════════
  section('T4: Move + 分支')
  reset()

  const t4a = simulateRound('创建', [{ type: 'card', data: { title: 'Target', x: 50, y: 50 } }])
  const t4b = simulateRound('移动', [], [{ cmd: 'move', title: 'target', x: 10, y: 10 }])

  const aPos = getComputedCardPositions(t4a)
  const bPos = getComputedCardPositions(t4b)

  // A should have original position
  const targetInA = aPos['Target']
  assert(targetInA != null, `Target exists in A`)

  // B should have moved position
  const targetInB = bPos['Target']
  assert(targetInB != null, `Target exists in B after move`)

  // If move was recorded, positions should differ
  // (move ops change positions in computeCanvas)

  // Explicit branch from A (should NOT have the move)
  const t4c = simulateRound('无移动分支', [{ type: 'card', data: { title: 'Fresh', x: 70, y: 70 } }], [], t4a)
  const cPos = getComputedCardPositions(t4c)
  assert(cPos['Fresh'] != null, `C has Fresh card`)

  // ═══════════════════════════════════════════
  // T5: Update + 分支
  // ═══════════════════════════════════════════
  section('T5: Update + 分支')
  reset()

  const t5a = simulateRound('初始', [{ type: 'card', data: { title: '原标题', x: 50, y: 30 } }])
  const t5b = simulateRound('更新', [], [{ cmd: 'update', title: '原标题', newTitle: '新标题' }])

  const aTitles5 = getComputedCardTitles(t5a)
  assert(aTitles5.includes('原标题'), `A has 原标题`)

  const bCards5 = timelineStore.computeCanvas(t5b)
  const bHasNew = [...bCards5.values()].some(c => c.data.title === '新标题')
  assert(bHasNew, `B has 新标题 after update`)

  // ═══════════════════════════════════════════
  // T7: 多轮快速导航（不崩）
  // ═══════════════════════════════════════════
  section('T7: 多轮快速导航')
  reset()

  for (let i = 0; i < 5; i++) {
    simulateRound(`Round ${i}`, [{ type: 'card', data: { title: `Card ${i}`, x: 20 + i * 15, y: 30 } }])
  }

  assert(timelineStore.nodes.size === 5, `5 nodes created`)

  // Rapid navigation
  timelineStore.viewingId = timelineStore.activeTip
  let navOk = true
  try {
    for (let i = 0; i < 20; i++) {
      const dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)]
      timelineStore.navigate(dir)
      // Also compute canvas at current position
      const viewId = timelineStore.viewingId ?? timelineStore.activeTip
      if (viewId != null) timelineStore.computeCanvas(viewId)
    }
  } catch (e) {
    navOk = false
    results.push(`  ❌ Crash during rapid navigation: ${e.message}`)
  }
  assert(navOk, `Survived 20 rapid random navigations without crash`)

  // ═══════════════════════════════════════════
  // T8: 分支的分支 (3 层树)
  // ═══════════════════════════════════════════
  section('T8: 分支的分支')
  reset()

  const t8a = simulateRound('Root', [{ type: 'card', data: { title: 'Root', x: 50, y: 30 } }])
  const t8b = simulateRound('B', [{ type: 'card', data: { title: 'B', x: 30, y: 30 } }])
  const t8c = simulateRound('C', [{ type: 'card', data: { title: 'C', x: 20, y: 30 } }])

  // Explicit branch from A → D
  const t8d = simulateRound('D', [{ type: 'card', data: { title: 'D', x: 70, y: 30 } }], [], t8a)

  // Explicit branch from B → E
  const t8e = simulateRound('E', [{ type: 'card', data: { title: 'E', x: 60, y: 60 } }], [], t8b)

  // Tree should be: A→[B→[C,E], D]
  const nodeA8 = timelineStore.nodes.get(t8a)
  assert(nodeA8.childIds.length === 2, `A has B and D as children`)

  const nodeB8 = timelineStore.nodes.get(t8b)
  assert(nodeB8.childIds.length === 2, `B has C and E as children`)

  // E should have Root (decayed) + B (decayed) + E
  const eCards = timelineStore.computeCanvas(t8e)
  const eHasE = [...eCards.values()].some(c => c.data.title === 'E')
  assert(eHasE, `E has E card`)
  const eHasC = [...eCards.values()].some(c => c.data.title === 'C')
  assert(!eHasC, `E does NOT have C card`)

  // ═══════════════════════════════════════════
  // T9: 空节点
  // ═══════════════════════════════════════════
  section('T9: 空节点')
  reset()

  const t9a = simulateRound('有内容', [{ type: 'card', data: { title: 'Content', x: 50, y: 30 } }])
  // Simulate empty round (no cards, no commands)
  const parentId9 = timelineStore.getBranchPoint()
  const t9b = timelineStore.branchFrom(parentId9, '空回复')
  timelineStore.addOperation(t9b, { op: 'push' })
  // No create operations

  let emptyOk = true
  try {
    const emptyCards = timelineStore.computeCanvas(t9b)
    // Should have Content from A (maybe decayed away)
    timelineStore.restoreToNode(t9b)
  } catch (e) {
    emptyOk = false
    results.push(`  ❌ Crash on empty node: ${e.message}`)
  }
  assert(emptyOk, `Empty node doesn't crash`)

  // Navigate through empty node
  timelineStore.viewingId = t9b
  timelineStore.navigate('up')
  assert(timelineStore.viewingId === t9a, `Can navigate up from empty node`)

  // ═══════════════════════════════════════════
  // T10: Cache invalidation
  // ═══════════════════════════════════════════
  section('T10: Cache invalidation after late operation')
  reset()

  const t10a = simulateRound('Start', [{ type: 'card', data: { title: 'Alpha', x: 50, y: 30 } }])
  
  // Compute and cache
  const cached1 = timelineStore.computeCanvas(t10a)
  const count1 = cached1.size

  // Add late operation to same node
  timelineStore.addOperation(t10a, {
    op: 'create',
    card: { id: 'late-card', type: 'card', data: { title: 'Late', x: 30, y: 30 }, x: 30, y: 30, z: 0, w: 25, zIndex: 100, intraZ: 0 }
  })

  const cached2 = timelineStore.computeCanvas(t10a)
  assert(cached2.size > count1, `Cache invalidated — late card added (${count1} → ${cached2.size})`)

  // ═══════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════
  results.push(`\n${'═'.repeat(40)}`)
  results.push(`TOTAL: ${passCount}/${testCount} passed`)
  if (passCount < testCount) {
    results.push(`⚠️ ${testCount - passCount} FAILURES`)
  } else {
    results.push(`🎉 ALL PASSED`)
  }

  console.log(results.join('\n'))
  return { passed: passCount, total: testCount, results }
})()
