/**
 * Blue Team Stress Tests — Architecture Robustness
 * 
 * Tests the new "canvas as derived view" architecture against
 * adversarial scenarios: race conditions, state pollution,
 * extreme inputs, and navigation chaos.
 * 
 * Run in browser: fetch('/tests/blue-team-stress.js').then(r=>r.text()).then(eval)
 */
(function blueTeamStress() {
  const app = document.querySelector('#app').__vue_app__
  const pinia = app.config.globalProperties.$pinia
  const timelineStore = pinia._s.get('timeline')
  const canvasStore = pinia._s.get('canvas')

  if (!timelineStore || !canvasStore) {
    console.error('❌ Stores not found')
    return { passed: 0, total: 0, results: ['❌ Stores not found'] }
  }

  const results = []
  let testCount = 0
  let passCount = 0

  function assert(condition, msg) {
    testCount++
    if (condition) { passCount++; results.push(`  ✅ ${msg}`) }
    else { results.push(`  ❌ ${msg}`) }
  }

  function section(name) { results.push(`\n## ${name}`) }

  function reset() {
    timelineStore.reset()
    canvasStore.cards.clear()
    canvasStore.depthLevel = 0
    canvasStore.currentRoundDepth = -1
    canvasStore.currentRoundIds = new Set()
    canvasStore.selectedIds = new Set()
    canvasStore.greetingVisible = true
    canvasStore.isStreaming = false
  }

  function simulateRound(userMsg, cards, commands = [], fromParent = null) {
    let nodeId
    if (fromParent !== null) {
      nodeId = timelineStore.createNode(fromParent, userMsg)
    } else {
      const parentId = timelineStore.getBranchPoint()
      nodeId = timelineStore.branchFrom(parentId, userMsg)
    }
    canvasStore.beginRound()
    timelineStore.addOperation(nodeId, { op: 'push' })
    cards.forEach((c, i) => {
      timelineStore.addOperation(nodeId, {
        op: 'create',
        globalIndex: i,
        card: { type: c.type, data: { ...c.data }, contentKey: `r${canvasStore.depthLevel}-${i}` },
      })
    })
    commands.forEach(cmd => {
      const target = (cmd.title || '').toLowerCase()
      const matchedIds = []
      canvasStore.cards.forEach(card => {
        const title = (card.data.title || '').toLowerCase()
        if (title.includes(target)) matchedIds.push(card.id)
      })
      if (cmd.cmd === 'move') {
        matchedIds.forEach(cardId => {
          timelineStore.addOperation(nodeId, {
            op: 'move', cardId,
            to: { x: cmd.x != null ? 5 + (cmd.x/100)*90 : undefined, y: cmd.y != null ? 5 + (cmd.y/100)*75 : undefined, z: cmd.z ?? 30 }
          })
        })
      } else if (cmd.cmd === 'update') {
        const { cmd: _, title: __, ...rawChanges } = cmd
        if (rawChanges.newTitle) { rawChanges.title = rawChanges.newTitle; delete rawChanges.newTitle }
        matchedIds.forEach(cardId => {
          timelineStore.addOperation(nodeId, { op: 'update', cardId, changes: rawChanges })
        })
      }
    })
    return nodeId
  }

  // ═══════════════════════════════════════════
  // ATTACK 1: State pollution via computeCanvas return
  // ═══════════════════════════════════════════
  section('ATTACK-1: computeCanvas output mutation')
  reset()
  const a1 = simulateRound('Test', [{ type: 'card', data: { title: 'Original', x: 50, y: 30 } }])
  
  const computed1 = timelineStore.computeCanvas(a1)
  // Mutate the returned map's card data
  computed1.forEach(card => { card.data.title = 'HACKED' })
  
  // Recompute — should NOT be affected by mutation
  // (cache was invalidated since we mutated... but if cached, it would be wrong)
  // Force a fresh compute by invalidating
  timelineStore.addOperation(a1, { op: 'push' })
  const computed2 = timelineStore.computeCanvas(a1)
  const titles2 = [...computed2.values()].map(c => c.data.title)
  assert(titles2.includes('Original'), `Mutation of computeCanvas output doesn't affect source (got ${titles2})`)

  // ═══════════════════════════════════════════
  // ATTACK 2: 100 consecutive pushes (no creates)
  // ═══════════════════════════════════════════
  section('ATTACK-2: 100 pushes without creates')
  reset()
  const a2 = timelineStore.branchFrom(null, 'PushSpam')
  canvasStore.beginRound()
  let pushOk = true
  try {
    for (let i = 0; i < 100; i++) {
      timelineStore.addOperation(a2, { op: 'push' })
    }
    const computed = timelineStore.computeCanvas(a2)
    // Should not crash, cards should be empty or minimal
  } catch (e) {
    pushOk = false
    results.push(`    Crash: ${e.message}`)
  }
  assert(pushOk, '100 pushes without crash')

  // ═══════════════════════════════════════════
  // ATTACK 3: contentKey collision
  // ═══════════════════════════════════════════
  section('ATTACK-3: contentKey collision')
  reset()
  const a3 = timelineStore.branchFrom(null, 'Collision')
  canvasStore.beginRound()
  timelineStore.addOperation(a3, { op: 'push' })
  timelineStore.addOperation(a3, {
    op: 'create', globalIndex: 0,
    card: { type: 'card', data: { title: 'First', x: 30, y: 30 }, contentKey: 'collision-key' }
  })
  timelineStore.addOperation(a3, {
    op: 'create', globalIndex: 1,
    card: { type: 'card', data: { title: 'Second', x: 70, y: 30 }, contentKey: 'collision-key' }
  })
  // Second should overwrite first (same contentKey = streaming update)
  const titles3 = [...canvasStore.cards.values()].map(c => c.data.title)
  assert(titles3.includes('Second'), `contentKey collision: second overwrites first (got ${titles3})`)
  assert(!titles3.includes('First'), `contentKey collision: first is gone`)

  // ═══════════════════════════════════════════
  // ATTACK 4: update non-existent cardId
  // ═══════════════════════════════════════════
  section('ATTACK-4: update/move non-existent card')
  reset()
  const a4 = timelineStore.branchFrom(null, 'Ghost')
  canvasStore.beginRound()
  let ghostOk = true
  try {
    timelineStore.addOperation(a4, { op: 'update', cardId: 'ghost-id-999', changes: { title: 'Phantom' } })
    timelineStore.addOperation(a4, { op: 'move', cardId: 'ghost-id-999', to: { x: 10, y: 10, z: 50 } })
    timelineStore.addOperation(a4, { op: 'remove', cardId: 'ghost-id-999' })
    timelineStore.computeCanvas(a4)
  } catch (e) {
    ghostOk = false
  }
  assert(ghostOk, 'Operations on non-existent cards don\'t crash')

  // ═══════════════════════════════════════════
  // ATTACK 5: Extreme data size
  // ═══════════════════════════════════════════
  section('ATTACK-5: Large data payload')
  reset()
  const a5 = timelineStore.branchFrom(null, 'BigData')
  canvasStore.beginRound()
  timelineStore.addOperation(a5, { op: 'push' })
  const bigText = 'x'.repeat(100000) // 100KB
  let bigOk = true
  try {
    timelineStore.addOperation(a5, {
      op: 'create', globalIndex: 0,
      card: { type: 'card', data: { title: 'Big', text: bigText, x: 50, y: 30 }, contentKey: 'big-0' }
    })
    assert(canvasStore.cards.size >= 1, `Big card created (${canvasStore.cards.size})`)
    const computed = timelineStore.computeCanvas(a5)
    const bigCard = [...computed.values()].find(c => c.data.title === 'Big')
    assert(bigCard && bigCard.data.text.length === 100000, 'Big data preserved in computeCanvas')
  } catch (e) {
    bigOk = false
    results.push(`    Crash: ${e.message}`)
  }
  assert(bigOk, 'Large data doesn\'t crash')

  // ═══════════════════════════════════════════
  // ATTACK 6: Deep linear chain (50 nodes)
  // ═══════════════════════════════════════════
  section('ATTACK-6: Deep chain (50 nodes)')
  reset()
  let deepOk = true
  try {
    for (let i = 0; i < 50; i++) {
      simulateRound(`D${i}`, [{ type: 'card', data: { title: `Deep${i}`, x: 50, y: 30 } }])
    }
    assert(timelineStore.nodes.size === 50, `50 nodes created`)
    // Navigate to root
    for (let i = 0; i < 50; i++) timelineStore.navigate('up')
    const rootId = timelineStore.viewingId
    const rootCards = timelineStore.computeCanvas(rootId)
    const hasDeep0 = [...rootCards.values()].some(c => c.data.title === 'Deep0')
    assert(hasDeep0, 'Root has Deep0 card')
    // Navigate back to tip
    for (let i = 0; i < 50; i++) timelineStore.navigate('down')
  } catch (e) {
    deepOk = false
    results.push(`    Crash: ${e.message}`)
  }
  assert(deepOk, 'Deep chain navigation doesn\'t crash')

  // ═══════════════════════════════════════════
  // ATTACK 7: Wide fan (20 children from one parent)
  // ═══════════════════════════════════════════
  section('ATTACK-7: Wide fan (20 branches)')
  reset()
  const rootFan = simulateRound('Hub', [{ type: 'card', data: { title: 'Hub', x: 50, y: 30 } }])
  let fanOk = true
  try {
    for (let i = 0; i < 20; i++) {
      simulateRound(`Branch${i}`, [{ type: 'card', data: { title: `Fan${i}`, x: 50, y: 30 } }], [], rootFan)
    }
    const hubNode = timelineStore.nodes.get(rootFan)
    assert(hubNode.childIds.length === 20, `Hub has 20 children (got ${hubNode.childIds.length})`)
    
    // Navigate through all siblings
    timelineStore.viewingId = hubNode.childIds[0]
    for (let i = 0; i < 19; i++) {
      timelineStore.navigate('right')
    }
    assert(timelineStore.viewingId === hubNode.childIds[19], 'Navigated to last sibling')
    
    // Each branch should have its own card, not others'
    const branch5Cards = timelineStore.computeCanvas(hubNode.childIds[5])
    const has5 = [...branch5Cards.values()].some(c => c.data.title === 'Fan5')
    const has10 = [...branch5Cards.values()].some(c => c.data.title === 'Fan10')
    assert(has5, 'Branch 5 has Fan5')
    assert(!has10, 'Branch 5 does NOT have Fan10')
  } catch (e) {
    fanOk = false
    results.push(`    Crash: ${e.message}`)
  }
  assert(fanOk, 'Wide fan doesn\'t crash')

  // ═══════════════════════════════════════════
  // ATTACK 8: Rapid random navigation chaos
  // ═══════════════════════════════════════════
  section('ATTACK-8: 200 random navigations')
  reset()
  // Build a tree with some structure
  const chaos_a = simulateRound('A', [{ type: 'card', data: { title: 'A', x: 50, y: 30 } }])
  const chaos_b = simulateRound('B', [{ type: 'card', data: { title: 'B', x: 30, y: 30 } }])
  const chaos_c = simulateRound('C', [{ type: 'card', data: { title: 'C', x: 70, y: 30 } }])
  simulateRound('D', [{ type: 'card', data: { title: 'D', x: 50, y: 50 } }], [], chaos_a)
  simulateRound('E', [{ type: 'card', data: { title: 'E', x: 50, y: 50 } }], [], chaos_b)

  let chaosOk = true
  try {
    const dirs = ['up', 'down', 'left', 'right']
    for (let i = 0; i < 200; i++) {
      const dir = dirs[Math.floor(Math.random() * 4)]
      timelineStore.navigate(dir)
      // Also restore canvas at current position
      const viewId = timelineStore.viewingId ?? timelineStore.activeTip
      if (viewId != null) timelineStore.restoreToNode(viewId)
    }
  } catch (e) {
    chaosOk = false
    results.push(`    Crash: ${e.message}`)
  }
  assert(chaosOk, '200 random navigations with restoreToNode survived')

  // ═══════════════════════════════════════════
  // ATTACK 9: addOperation to non-live node (viewing old)
  // ═══════════════════════════════════════════
  section('ATTACK-9: addOperation to non-live node')
  reset()
  const old_a = simulateRound('OldA', [{ type: 'card', data: { title: 'OldA', x: 50, y: 30 } }])
  const old_b = simulateRound('OldB', [{ type: 'card', data: { title: 'OldB', x: 50, y: 30 } }])
  
  // Navigate to view old_a (not live)
  timelineStore.viewingId = old_a
  
  // Add operation to old_a (not the active tip)
  const canvasBefore = canvasStore.cards.size
  timelineStore.addOperation(old_a, {
    op: 'create', globalIndex: 99,
    card: { type: 'card', data: { title: 'Injected', x: 50, y: 30 }, contentKey: 'injected-99' }
  })
  
  // Since old_a is NOT activeTip, canvas should NOT auto-update
  assert(canvasStore.cards.size === canvasBefore, `Canvas unchanged when adding to non-live node (${canvasBefore} → ${canvasStore.cards.size})`)
  
  // But computeCanvas should have it
  const oldComputed = timelineStore.computeCanvas(old_a)
  const hasInjected = [...oldComputed.values()].some(c => c.data.title === 'Injected')
  assert(hasInjected, 'computeCanvas has injected card for old node')

  // ═══════════════════════════════════════════
  // ATTACK 10: NaN/negative positions
  // ═══════════════════════════════════════════
  section('ATTACK-10: NaN/negative positions')
  reset()
  const nan_a = timelineStore.branchFrom(null, 'NaN')
  canvasStore.beginRound()
  timelineStore.addOperation(nan_a, { op: 'push' })
  let nanOk = true
  try {
    timelineStore.addOperation(nan_a, {
      op: 'create', globalIndex: 0,
      card: { type: 'card', data: { title: 'NaN', x: NaN, y: -100 }, contentKey: 'nan-0' }
    })
    timelineStore.addOperation(nan_a, {
      op: 'move', cardId: [...canvasStore.cards.keys()][0],
      to: { x: Infinity, y: -Infinity, z: NaN }
    })
  } catch (e) {
    nanOk = false
  }
  assert(nanOk, 'NaN/Infinity positions don\'t crash')

  // ═══════════════════════════════════════════
  // ATTACK 11: Rapid reset + recreate cycles
  // ═══════════════════════════════════════════
  section('ATTACK-11: Reset/recreate cycles')
  let cycleOk = true
  try {
    for (let i = 0; i < 20; i++) {
      reset()
      simulateRound(`Cycle${i}`, [{ type: 'card', data: { title: `C${i}`, x: 50, y: 30 } }])
      const computed = timelineStore.computeCanvas(timelineStore.activeTip)
      const has = [...computed.values()].some(c => c.data.title === `C${i}`)
      if (!has) { cycleOk = false; break }
    }
  } catch (e) {
    cycleOk = false
  }
  assert(cycleOk, '20 reset/recreate cycles clean')

  // ═══════════════════════════════════════════
  // ATTACK 12: Canvas mutation doesn't leak to timeline
  // ═══════════════════════════════════════════
  section('ATTACK-12: Canvas card mutation isolation')
  reset()
  const iso_a = simulateRound('Iso', [{ type: 'card', data: { title: 'Pristine', x: 50, y: 30 } }])
  
  // Mutate canvas card directly
  canvasStore.cards.forEach(card => { card.data.title = 'MUTATED' })
  
  // Navigate away and back — should restore from timeline
  timelineStore.viewingId = iso_a
  timelineStore.restoreToNode(iso_a)
  
  const restoredTitles = [...canvasStore.cards.values()].map(c => c.data.title)
  // Note: restoreFrom uses computeCanvas which replays operations
  // The operation has the original data... but addOperation wrote back card.data
  // Let's check what computeCanvas returns
  const isoComputed = timelineStore.computeCanvas(iso_a)
  const computedTitles = [...isoComputed.values()].map(c => c.data.title)
  assert(computedTitles.includes('Pristine'), `computeCanvas returns original title after canvas mutation (got ${computedTitles})`)

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
