// server.js

const express = require('express');
const path = require('path'); // <--- ASÍ ES COMO SE IMPORTA EL MÓDULO 'path'
const db = require('./database'); // Asume database.js está en misma carpeta
const fs = require('fs');

const app = express();
app.use(express.json());

// --- === SERVIR ARCHIVOS ESTÁTICOS del Frontend === ---
// Todo lo que esté en la carpeta 'public' será accesible desde la raíz de la URL
app.use(express.static(path.join(__dirname, 'public')));

// --- === RUTA PRINCIPAL PARA SERVIR index.html === ---
// Cuando alguien acceda a la raíz (http://localhost:3000/), envía el index.html
app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] GET / -> Sirviendo index.html`);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Nota: No necesitas rutas separadas para select_campaign.html o game_play.html
// porque el navegador las solicitará y express.static las servirá.
// --- === FIN SERVIR ARCHIVOS ESTÁTICOS === ---


// 3. Cargar Datos de la Campaña
let campaignData = {};
const campaignDataPath = path.join(__dirname, 'campaign_data.json');
try {
    const rawData = fs.readFileSync(campaignDataPath, 'utf8');
    campaignData = JSON.parse(rawData);
    console.log("✅ Datos de campaña parseados.");
    // *** AÑADIR ESTE LOG ***
    console.log("   -> Claves principales encontradas en campaignData:", Object.keys(campaignData));
    // *** FIN AÑADIR LOG ***

    if (!campaignData || !campaignData.minas_corruptas) { // Ahora la validación es crucial
        throw new Error("La clave 'minas_corruptas' no existe en el objeto campaignData cargado.");
    }
    console.log(`   -> Campaña(s) validada(s): ${Object.keys(campaignData).join(', ')}`);
} catch (error) { console.error(" FATAL ERROR cargando JSON:", error.message); process.exit(1); }

// --- Función Lógica Central 'processGameStep' ---
// (Como en la respuesta anterior - Calcula earnedXp, hpChange, flagsToSet, targetSectionId, combatInfo, etc.)
// MODIFICACIÓN: Cuando determina combate, targetSectionId debe ser algo como "combat_pending" o similar
//               para que la ruta /api/make_choice lo detecte.
// --- === FUNCIÓN LÓGICA CENTRAL 'processGameStep' (COMPLETA) === ---
// Interpreta campaignData y el estado/elección actual para calcular resultados.
// --- FUNCIÓN LÓGICA CENTRAL 'processGameStep' (COMPLETA) ---
function processGameStep(campaignId, currentSectionId, characterState, choiceResult) {
    console.log(`[Logic] Processing step: Camp=${campaignId}, Sect=${currentSectionId}, Choice=`, choiceResult);

    // 1. INICIALIZACIÓN y OBTENER DATOS SECCIÓN
    characterState = characterState || { pv_current: 0, XP: 0, Inventory: [], gameState: { campaign_flags_json: {} }, class:'?', name:'?' };
    characterState.gameState = characterState.gameState || { campaign_flags_json: {} };
    characterState.gameState.campaign_flags_json = characterState.gameState.campaign_flags_json || {};
    const flags = characterState.gameState.campaign_flags_json;
    const currentSectionData = getSectionFromData(campaignId, currentSectionId);
    if (!currentSectionData || currentSectionData.id?.toString().startsWith('error')) {
         return { error: `Sección ${currentSectionId} inválida o no encontrada.` };
     }
     let calculatedResults = { earnedXp: 0, hpChange: 0, penaltyApplied: null, flagsToSet: {}, itemsGained: [], itemsLost: [], targetSectionId: currentSectionData.next_section || currentSectionId, combatInfo: null, feedback: null, error: null };
    let nextSteps = {};
    let chosenOption = null;

    // 2. DETERMINAR Y VALIDAR OPCIÓN ELEGIDA
    if (choiceResult && choiceResult.optionIndex !== undefined && currentSectionData.options && currentSectionData.options[choiceResult.optionIndex]) {
        chosenOption = currentSectionData.options[choiceResult.optionIndex];
         // Validar Precondiciones
        let canChoose = true;
         if (chosenOption.class_req && (!characterState.class || characterState.class.toLowerCase() !== chosenOption.class_req.toLowerCase())) { canChoose = false; calculatedResults.feedback = `Acción fallida: Requiere ser ${chosenOption.class_req}.`; }
         if (canChoose && chosenOption.precondition_flag && !chosenOption.precondition_flag.includes('always_available') && !chosenOption.precondition_flag.some(flag => flags[flag])) { canChoose = false; calculatedResults.feedback = "Acción fallida: No cumples los requisitos."; }
         if (canChoose && chosenOption.hide_if_flag && flags[chosenOption.hide_if_flag]) { canChoose = false; calculatedResults.feedback = "Acción fallida: Opción no disponible."; console.warn(`[Logic] Opción ${choiceResult.optionIndex} oculta.`); }
        if (!canChoose) { calculatedResults.targetSectionId = currentSectionId; calculatedResults.error = calculatedResults.feedback; return calculatedResults; }

        // Determinar Lógica 'nextSteps'
         if (chosenOption.check && choiceResult.success !== undefined) {
            nextSteps = choiceResult.success ? chosenOption.next.success : chosenOption.next.failure;
            if (choiceResult.success && chosenOption.next.partial && choiceResult.roll >= chosenOption.next.partial.dc_met && choiceResult.roll < (chosenOption.check?.dc || 99)) { nextSteps = chosenOption.next.partial; console.log("[Logic] Resultado Parcial."); }
            else if (!choiceResult.success && chosenOption.next.failure?.check_fail_trigger_trap_on_5_below){ if(((chosenOption.check?.dc || 0) - (choiceResult.roll || 0)) >= 5){ nextSteps.penalty = chosenOption.next.failure.penalty || nextSteps.penalty; console.log("[Logic] Fallo Crítico->Penalty"); } else { nextSteps.penalty = null; }}
         } else if (chosenOption.next) { nextSteps = chosenOption.next; calculatedResults.targetSectionId = nextSteps.sectionId || currentSectionId; }
         else { console.warn(`Opción ${choiceResult.optionIndex} sin 'next'. Recargando.`); nextSteps = {}; calculatedResults.targetSectionId = currentSectionId; }

    } else if (currentSectionData.next_section) { calculatedResults.targetSectionId = currentSectionData.next_section; calculatedResults.earnedXp = currentSectionData.xp_reward || 0; }
    else if (!currentSectionData.is_ending_node && !(choiceResult && chosenOption)) { calculatedResults.targetSectionId = 'error'; }

    // 3. APLICAR RESULTADOS (XP, Penalty, Flags, Items)
    calculatedResults.earnedXp = (calculatedResults.earnedXp || 0) + (nextSteps.xp || 0);
    calculatedResults.penaltyApplied = nextSteps.penalty || null;
    calculatedResults.flagsToSet = nextSteps.flags_set || {};
    calculatedResults.feedback = nextSteps.feedback || calculatedResults.feedback;
     if (nextSteps.sectionId) calculatedResults.targetSectionId = nextSteps.sectionId;
     if (calculatedResults.targetSectionId === "USE_TARGET_SECTION_VAR" && choiceResult?.targetSectionAfterCombat) { calculatedResults.targetSectionId = choiceResult.targetSectionAfterCombat || 'error'; }

    // 4. RESOLVER ITEMS Y HP
    // Asegúrate que rollDamage esté definido ANTES o globalmente
     function resolveItemQuantity(itemDef) { /* ... como antes ... */ } // Incluye la función interna aquí
     calculatedResults.itemsGained = (nextSteps.items_gained || []).map(resolveItemQuantity).filter(i=>i && i.item_id && i.quantity > 0);
     calculatedResults.itemsLost = (nextSteps.items_lost || []).map(itemDef => ({item_id: typeof itemDef === 'string'?itemDef:itemDef.item_id, quantity:itemDef.quantity||1})).filter(i=>i.item_id);
     let hpLost = 0; let hpGained = 0;
     if (calculatedResults.penaltyApplied) {
         if (calculatedResults.penaltyApplied.startsWith('lose_hp_')) hpLost = rollDamage(calculatedResults.penaltyApplied.replace('lose_hp_', ''));
         if (calculatedResults.penaltyApplied.includes('_stun')) calculatedResults.flagsToSet['status_stunned'] = 1;
         if (calculatedResults.penaltyApplied.includes('poisoned')) calculatedResults.flagsToSet['status_poisoned'] = true;
         if (calculatedResults.penaltyApplied.startsWith('bleeding_')) calculatedResults.flagsToSet['status_bleeding'] = calculatedResults.penaltyApplied.replace('bleeding_', '');
         const ignoredPenaltyKeywords = ['lose_hp', 'damage', 'necrotic', 'stun', 'poisoned', 'bleeding'];
         if ( !calculatedResults.penaltyApplied.includes('_') && !ignoredPenaltyKeywords.some(kw => calculatedResults.penaltyApplied.includes(kw)) ) { calculatedResults.flagsToSet[`status_${calculatedResults.penaltyApplied}`] = true; }
         console.log(`[Logic] HP Penalty: ${calculatedResults.penaltyApplied} -> -${hpLost} PV`);
     }
     if(nextSteps.gain_hp) { hpGained = rollDamage(nextSteps.gain_hp); console.log(`[Logic] HP Gain: ${nextSteps.gain_hp} -> +${hpGained} PV`);}
     calculatedResults.hpChange = hpGained - hpLost;

    // 5. PREPARAR COMBAT INFO
    if (calculatedResults.targetSectionId === 'combat') {
         console.log("[Logic] Preparando para combate...");
         calculatedResults.combatInfo = { setup: nextSteps.combat_setup || 'normal', targetSectionAfterCombat: nextSteps.targetSectionAfterCombat || currentSectionData.next_section || 'error', enemies: nextSteps.enemy_data || currentSectionData.enemies || [], origin_section: currentSectionId };
         calculatedResults.targetSectionId = 'combat_pending'; // SEÑAL
         console.log(`[Logic] Combate pendiente. PostCombat->${calculatedResults.combatInfo.targetSectionAfterCombat}`);
    }

    // 6. Devolver Resultados
    console.log("[Logic] Final Calculated Results:", calculatedResults);
    return calculatedResults;
}
// --- === FIN FUNCIÓN LÓGICA CENTRAL === ---
function rollDamage(diceString = '0'){
    if (!diceString || typeof diceString !== 'string') return 0;
    if (diceString.includes('d')) {
        const parts = diceString.toLowerCase().split('d');
        const numDice = parseInt(parts[0] || '1', 10);
        const numSides = parseInt(parts[1] || '6', 10);
        let total = 0;
        for(let i=0; i<numDice; i++) { total += Math.floor(Math.random() * numSides) + 1;}
        const bonusMatch = diceString.match(/[+|-]\d+$/); // Buscar +N o -N al final
        const bonus = bonusMatch ? parseInt(bonusMatch[0], 10) : 0;
        return Math.max(0, total + bonus); // Asegura daño no negativo
     }
     return parseInt(diceString, 10) || 0;
 }
 // --- Función Auxiliar para Resolver Ataque ---
// Recibe atacante, defensor (objetos de combatants) y datos del ataque específico a usar
// Devuelve un objeto { success: boolean, crit: boolean, damageDealt: number, logMessages: string[] }
function resolveAttack(attacker, defender, attackData) {
    const attackLog = [];
    const attackName = attackData.nombre || 'Ataque';
    const attackBonus = parseInt(attackData.bono_ataque?.replace('+','') || '0'); // Quita '+' y convierte a número
    const targetAC = defender.ca || 10;
    const roll = rollD20();
    const totalAttackRoll = roll + attackBonus;
    const isCrit = (roll === 20);
    const isHit = isCrit || (totalAttackRoll >= targetAC);

    attackLog.push(`${attacker.name} ataca a ${defender.name} con ${attackName} (${roll}+${attackBonus}=${totalAttackRoll} vs CA ${targetAC})...`);

    let damageDealt = 0;
    if (isHit) {
         if(isCrit) { attackLog.push(`   💥 ¡GOLPE CRÍTICO!`); }

         // Calcular Daño Base + Modificador si no incluido en ataqueData.dano
         // (Asumimos que bono_ataque incluye competencia si aplica, daño base + mod stat)
          let baseDamageRoll = rollDamage(attackData.dano || '1d4');
          damageDealt = baseDamageRoll;

         // Aplicar Crítico (doble dado base simplificado)
         if (isCrit) { damageDealt += rollDamage(attackData.dano || '1d4'); }

          // Añadir daño Adicional (ej: necrótico Ghoruk, Furtivo Pícaro) - ¡LÓGICA AVANZADA NECESARIA!
          // if (attackData.dano_adicional && attackData.dano_adicional.cantidad){
          //    damageDealt += rollDamage(attackData.dano_adicional.cantidad);
          // }
          // if (attacker.is_pj && attacker.Class === 'Pícaro' && /* Condición Furtivo OK */ ) {
          //     damageDealt += rollDamage('Xd6'); // X según nivel
          // }


          // Aplicar Resist/Vulner/Inmun (Simplificado - Solo tipos de ataqueData.tipo_dano)
          // const damageType = attackData.tipo_dano || 'desconocido';
          // if(defender.stats_snapshot?.vulnerabilidades?.includes(damageType)) damageDealt = Math.floor(damageDealt * 2);
          // if(defender.stats_snapshot?.resistencias?.includes(damageType)) damageDealt = Math.floor(damageDealt / 2);
          // if(defender.stats_snapshot?.inmunidades?.includes(damageType)) damageDealt = 0;

         // Aplicar daño
         defender.current_pv = Math.max(0, defender.current_pv - damageDealt);
         attackLog.push(`   ➡️ ¡IMPACTO! Causa ${damageDealt} daño. ${defender.name} PV: ${defender.current_pv}/${defender.max_pv}.`);

         // Comprobar si cae
         if(defender.current_pv === 0) {
             defender.status_effects.push("derrotado");
              attackLog.push(`   💀 ¡${defender.name} ha caído!`);
          }

          // Aplicar Efectos Adicionales del Ataque (PENDIENTE)
          // if(attackData.efecto_adicional) { /* ... Lógica Salvaciones, aplicar Estados ... */ }

     } else {
          attackLog.push(`   ❌ ¡Fallo!`);
      }

    return { success: isHit, crit: isCrit, damageDealt: damageDealt, logMessages: attackLog };
}

// --- === NUEVA RUTA API: PROCESAR ACCIÓN DE COMBATE === ---
app.post('/api/combat/action', async (req, res) => {
    const { combatId, characterId, action } = req.body;
    console.log(`\n[API] COMBAT_ACTION: CombatID=${combatId}, CharID=${characterId}, Action=`, action);
    if (!combatId || !characterId || !action || !action.type) return res.status(400).json({ error: 'Datos insuficientes.' });

    let combatConnection; // Para potencial transacción si acción afecta múltiples tablas
    try {
        // 1. OBTENER ESTADO ACTUAL COMBATE (Asume getCombatStateById existe en db.js)
        let combatStateData = await db.getCombatStateById(combatId); // Función a implementar en database.js
        if (!combatStateData) return res.status(404).json({ error: 'Combate no encontrado.' });
        let combatState = combatStateData.combat_state_json; // El objeto JSON
         const currentCampaignId = combatStateData.campaign_id; // Necesario para datos enemigos

        // Verificar si ya terminó? Podría pasar si hay llamadas concurrentes
         if (combatState.combatEnded) {
              console.warn(`[API Combat] Intento de acción en combate ${combatId} ya finalizado.`);
               // Devolver la sección post-combate adecuada? Requiere más lógica.
               // Por ahora, solo indicamos que terminó.
               return res.status(409).json({ combatEnded: true, victory: combatState.victory, message:"El combate ya ha terminado."});
          }


        // 2. VALIDAR TURNO
        let currentTurnIndex = combatState.current_turn_index;
        let turnOrder = combatState.turn_order;
        const currentCombatantTempId = turnOrder[currentTurnIndex];
        let actingCombatant = combatState.combatants.find(c => c.temp_id === currentCombatantTempId);

        if (!actingCombatant) throw new Error(`Combatiente ${currentCombatantTempId} no hallado en estado ${combatId}`);
         // Asegurarse que la acción viene del PJ correcto (si es turno PJ)
        if (actingCombatant.is_pj && actingCombatant.original_id !== characterId) return res.status(403).json({ error: 'No es el turno de este personaje.' });
        // Si estaba esperando acción PJ pero el turno ya había avanzado (por llamadas concurrentes?) -> error?

        // 3. PROCESAR ACCIONES (Jugador o IA) - BUCLE HASTA SIGUIENTE ACCIÓN REQUERIDA DEL JUGADOR O FIN COMBATE
        let actionLog = [];
        let combatEnded = false;
        let victory = false;
        let pjs_activos = combatState.combatants.filter(c => c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
        let enemigos_activos = combatState.combatants.filter(c => !c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));

         let currentAction = actingCombatant.is_pj ? action : null; // La acción del jugador actual
         let keepProcessingTurns = true; // Para controlar el bucle

        while(keepProcessingTurns && !combatEnded) {
            actingCombatant = combatState.combatants.find(c => c.temp_id === turnOrder[currentTurnIndex]);
             if(!actingCombatant) break; // Seguridad

             const actorName = actingCombatant.name;
             console.log(`   -> Procesando Turno: ${actorName} (Índice ${currentTurnIndex})`);

             // Si combatiente está derrotado o incapacitado (ej: paralizado, aturdido), salta turno
              if (actingCombatant.current_pv <= 0 || actingCombatant.status_effects.includes("paralizado") || actingCombatant.status_effects.includes("aturdido")) {
                  actionLog.push(`--- Turno de ${actorName}: Pierde turno (Caído/Incapacitado).`);
              } else {
                   // Procesar efectos inicio turno (ej: salvación veneno, regeneración) - PENDIENTE

                   // A) Si es turno de la IA (Enemigo)
                   if (!actingCombatant.is_pj) {
                       actionLog.push(`--- Turno Enemigo: ${actorName} ---`);
                       // --- Ejecutar IA ---
                       let enemyAction = { type: "attack" }; // IA simple: siempre ataca
                       let targetPJ = null; let minPV = Infinity;
                       pjs_activos.forEach(pj => { // Ataca al PJ vivo con menos PV
                           if (pj.current_pv > 0 && pj.current_pv < minPV) { minPV = pj.current_pv; targetPJ = pj; }
                       });

                       if (targetPJ) {
                           enemyAction.target_temp_id = targetPJ.temp_id;
                            const attackData = actingCombatant.stats_snapshot?.ataques?.[0]; // Usa primer ataque
                            if (attackData) {
                               const atkBonus = parseInt(attackData.bono_ataque || '+0'); const targetAC = targetPJ.ca || 10; const roll = rollD20();
                                if ((roll + atkBonus) >= targetAC || roll === 20) { // Impacto
                                     let dmg = rollDamage(attackData.dano || '1d4') + (getModifier(actingCombatant.stats_snapshot?.fue_mod?.stat) || 0); // Añade mod stat si no está en bono
                                    // Aplicar Resist/Vulner/Inmun aquí...
                                    targetPJ.current_pv = Math.max(0, targetPJ.current_pv - dmg);
                                    actionLog.push(`   ${actorName} golpea a ${targetPJ.name} con ${attackData.nombre} causando ${dmg} daño. PV: ${targetPJ.current_pv}/${targetPJ.max_pv}.`);
                                    if(targetPJ.current_pv === 0) { targetPJ.status_effects.push("derrotado"); actionLog.push(`   💀 ¡${targetPJ.name} ha caído!`); pjs_activos = combatState.combatants.filter(/*recalcular*/); }
                                     // Aplicar efecto adicional enemigo - Lógica Pendiente
                                 } else { actionLog.push(`   ${actorName} ataca a ${targetPJ.name} y... ¡Falla!`); }
                             } else { actionLog.push(`   ${actorName} no tiene un ataque definido.`); }
                        } else { actionLog.push(`   ${actorName} no encuentra objetivos.`); }

                    }
                   // B) Si es turno del PJ (y es la acción recibida del frontend)
                   else if (currentAction) {
                       actionLog.push(`--- Turno PJ: ${actorName} (Ronda ${combatState.round_number}) ---`);
                        switch (currentAction.type.toLowerCase()) {
                           case 'attack': {
                                const target = combatState.combatants.find(c => c.temp_id === currentAction.target_temp_id);
                                if (!target || target.current_pv <= 0) { actionLog.push("Objetivo inválido."); break; }
                                 // MISMA lógica ataque PJ que antes (roll, daño, crit, etc.)
                                  // ...
                                 actionLog.push(/* Log Ataque PJ */);
                            } break;
                            // ... (Otros casos: cast_spell, dodge, use_item - usar lógica de antes) ...
                            case 'end_turn': actionLog.push(`${actorName} termina su turno.`); break;
                            default: actionLog.push(`Acción PJ ${currentAction.type} no procesada.`); break;
                        }
                        currentAction = null; // Marcar acción PJ como procesada
                        keepProcessingTurns = false; // Detener bucle tras acción PJ principal (backend espera siguiente input)

                   } else if (actingCombatant.is_pj){
                       // Si es turno del PJ pero no recibimos acción (o ya se procesó y avanzamos accidentalmente?)
                        console.warn(`[API Combat] Turno del PJ ${actingCombatant.name} pero no hay acción 'currentAction' que procesar. Deteniendo bucle.`);
                        keepProcessingTurns = false; // Esperar input frontend
                        break; // Salir del while
                    }


                   // Procesar efectos fin turno (veneno, regeneración...) - PENDIENTE
                    // Actualizar estado `status_effects` del `actingCombatant`
                     actingCombatant.status_effects = (actingCombatant.status_effects || [])
                           .map(eff => {/* ... lógica duración ... */ return eff;})
                           .filter(eff => eff !== null);

               } // Fin if (combatiente activo)


               // --- COMPROBAR FIN COMBATE OTRA VEZ --- (después de cada acción procesada)
                pjs_activos = combatState.combatants.filter(c => c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
               enemigos_activos = combatState.combatants.filter(c => !c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
               if (enemigos_activos.length === 0 || pjs_activos.length === 0) {
                   combatEnded = true;
                    victory = (enemigos_activos.length === 0);
                   keepProcessingTurns = false; // Detener bucle si acabó
                    console.log(`[API Combat] Fin de combate detectado en turno ${actingCombatant.name}. Victoria=${victory}`);
                   break; // Salir del while
               }


               // --- AVANZAR TURNO (SI NO ACABÓ Y AÚN PROCESAMOS) ---
               if (keepProcessingTurns) {
                   nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
                   combatState.combat_state_json.current_turn_index = nextTurnIndex;
                   currentTurnIndex = nextTurnIndex; // Actualizar para siguiente iteración del while
                   if (nextTurnIndex === 0) { // Nueva ronda
                       combatState.combat_state_json.round_number++;
                        actionLog.push(`*** Inicio Ronda ${combatState.combat_state_json.round_number} ***`);
                   }
                    // Si el SIGUIENTE turno es de un PJ, detener bucle para esperar input
                     if (combatState.combatants[nextTurnIndex]?.is_pj) {
                          keepProcessingTurns = false;
                          console.log(`   -> Próximo turno es del PJ ${combatState.combatants[nextTurnIndex]?.name}. Esperando acción.`);
                      }
                }

        } // --- FIN While(keepProcessingTurns && !combatEnded) ---


        // --- 8. GUARDAR ESTADO Y PREPARAR RESPUESTA ---
        combatState.combat_state_json.combat_log.push(...actionLog); // Añadir todo el log generado
        // Limitar log
         if(combatState.combat_state_json.combat_log.length > 70) combatState.combat_state_json.combat_log.slice(-70);


        let responseData = {};
        let finalCharacterState; // PJ principal actualizado post-combate

        if (combatEnded) {
            // --- Lógica Fin Combate ---
             console.log(`[API] Combate ${combatId} FINALIZADO. Victoria: ${victory}.`);
             let totalCombatXp = 0; if (victory) { /* ... Calcular XP ... */ totalCombatXp=250; actionLog.push(`Recompensa Victoria: +${totalCombatXp} XP.`); }
             else { actionLog.push("DERROTA."); }
             const finalSectionId = victory ? combatState.combat_state_json.target_section_win : combatState.combat_state_json.target_section_loss;

            // Borrar estado combate DB (USANDO CONEXIÓN ACTUAL DE LA TRANSACCIÓN!)
            await connection.execute('DELETE FROM `active_combats` WHERE `combat_id` = ?', [combatId]);
            console.log(`   -> Registro combate ${combatId} eliminado de DB.`);

             // Actualizar estado PJ en DB (USANDO CONEXIÓN ACTUAL!)
              // Necesitamos conseguir los PV FINALES del PJ principal desde el estado de combate
             const finalPJCombatData = combatState.combat_state_json.combatants.find(c => c.original_id === characterId && c.is_pj);
              // ATENCIÓN: updateGameState necesita modificarse para aceptar una conexión existente!
              // O hacemos el update del PJ aquí directamente dentro de la transacción:
              const finalXp = (await db.getCharacter(characterId)).xp + totalCombatXp; // Get current XP + combat XP
              const finalPv = finalPJCombatData ? finalPJCombatData.current_pv : 0;
              // TODO: Actualizar level, pv_max si subió nivel
               await connection.execute(
                  'UPDATE `characters` SET `xp` = ?, `pv_current` = ? /*, `level` = ? */, `updated_at` = NOW() WHERE `character_id` = ?',
                  [finalXp, finalPv, /* newLevel, */ characterId]
               );
               // Actualizar game_state para la nueva sección narrativa
               const finalFlags = JSON.stringify(character.gameState?.campaign_flags_json || {}); // Asume no hay flags nuevos post-combate aquí
               await connection.execute(
                    `INSERT INTO game_state (character_id, campaign_id, current_section_id, campaign_flags_json, last_saved_at) VALUES (?, ?, ?, ?, NOW())
                    ON DUPLICATE KEY UPDATE campaign_id = VALUES(campaign_id), current_section_id = VALUES(current_section_id), campaign_flags_json = VALUES(campaign_flags_json), last_saved_at = NOW()`,
                    [characterId, currentCampaignId, finalSectionId, finalFlags]
               );
               console.log(`   -> PJ ${characterId} y GameState actualizados a Sección ${finalSectionId} en DB.`);

             finalCharacterState = await db.getCharacter(characterId); // Obtener estado final real post-update
              finalCharacterState.gameState = await db.getGameState(characterId);

              // Preparar respuesta fin combate
             responseData = {
                 combatEnded: true, victory: victory, finalLog: actionLog, earnedXp: totalCombatXp,
                 nextSectionData: getSectionFromData(currentCampaignId, finalSectionId), // Carga datos sig. sección
                 updatedCharacterStats: finalCharacterState
             };

        } else {
            // --- Combate Continúa: Guardar Estado Actual ---
            await connection.execute(
                 'UPDATE `active_combats` SET `combat_state_json` = ?, `updated_at` = NOW() WHERE `combat_id` = ?',
                 [JSON.stringify(combatState.combat_state_json), combatId]
            );
            console.log(`   -> Estado combate ${combatId} actualizado en DB. Turno índice ${combatState.combat_state_json.current_turn_index}.`);

            // Preparar respuesta continuación
             responseData = {
                  combatEnded: false, turnLog: actionLog,
                  combatState: combatState.combat_state_json, // Enviar estado COMPLETO para UI
                  // Envía solo los datos del PJ principal para UI navbar (menos datos que el estado completo)
                  updatedCharacterStats: combatState.combat_state_json.combatants.find(c => c.original_id === characterId && c.is_pj)
             };
        }

        // --- 9. COMMIT y RESPUESTA ---
        await connection.commit(); // Confirma todos los cambios (UPDATE combat / DELETE combat + UPDATE character + UPDATE game_state)
        console.log(`   -> Transacción para Combate ${combatId} Confirmada.`);
        res.status(200).json(responseData);


    } catch (error) {
        if (combatConnection) await combatConnection.rollback();
        console.error("[API Error /combat/action]:", error);
        res.status(500).json({ error: error.message || "Error interno procesando acción combate." });
    } finally {
        if (combatConnection) combatConnection.release();
    }
});


function getSectionFromData(campaignId, sectionId) {
    console.log(`[Data] getSectionFromData: Buscando Camp=${campaignId}, Sect=${sectionId}`);

    // Verificar si la campaña existe en los datos cargados
    if (!campaignData || !campaignData[campaignId]) {
        console.error(`[Data] Error: Campaña '${campaignId}' no encontrada en campaignData.`);
        // Devolver una estructura de error consistente
        return { id: 'error_campaign_not_found', title: 'Error Interno', description: `Campaña ${campaignId} no encontrada.`, options: [] };
    }

    // Verificar si la sección existe dentro de la campaña
    if (campaignData[campaignId][sectionId]) {
        // ¡IMPORTANTE! Devolver una copia profunda para evitar modificar accidentalmente el original
        try {
             return JSON.parse(JSON.stringify(campaignData[campaignId][sectionId]));
        } catch(e){
             console.error(`[Data] Error clonando sección ${sectionId} de ${campaignId}. Datos podrían estar corruptos?`, e);
             // Devolver un error si no se pudo clonar (raro, pero posible con datos muy complejos/circulares)
             return { id: 'error_clone_failed', title: 'Error Interno', description: `No se pudo procesar sección ${sectionId}.`, options: [] };
        }

    } else {
        console.warn(`[Data] Advertencia: Sección '${sectionId}' no encontrada en campaña '${campaignId}'.`);
        // Devolver la sección de error DEFINIDA EN TU JSON si existe, sino null o una genérica
        return campaignData[campaignId]['error'] // Busca la sección 'error' dentro de esa campaña
               ? JSON.parse(JSON.stringify(campaignData[campaignId]['error'])) // Clónala también
               : { id: 'error_section_not_found', title: 'Error de Ruta', description: `Sección ${sectionId} no existe o no está implementada.`, options: [] }; // Error genérico si no hay nodo 'error'
    }
}

// --- Rutas API ---
app.get('/api/status', async (req, res) => {console.log(`[${new Date().toISOString()}] GET /api/status`);
let dbOk = false; // Estado DB por defecto

try {
    // === 1. OBTENER PJ y ESTADO desde DB ===
    // Llama a la función getCharacter definida en database.js
    const characterState = await db.getCharacter(characterId);
    if (!characterState) {
        // Si el personaje no se encuentra en la base de datos
        console.warn(`[API GetSection] Personaje ${characterId} no encontrado en DB.`);
        return res.status(404).json({ error: `Personaje con ID ${characterId} no encontrado.` });
    }

    // Llama a la función getGameState definida en database.js
    const gameState = await db.getGameState(characterId);
    // Adjunta el gameState al objeto characterState (o un objeto vacío si no hay estado guardado)
    characterState.gameState = gameState || { campaign_flags_json: {}, current_section_id: '1' }; // Asigna '1' como sección inicial si no hay gameState

    // === 2. DETERMINAR sección a cargar ===
    const sectionToLoad = (sectionId === 'current' && gameState?.current_section_id)
                        ? gameState.current_section_id
                        : (sectionId || '1'); // Usa la sección pedida, o '1' si no se especificó ninguna

    console.log(`   -> Intentando cargar estado PJ: ${characterState.name}, Sección DB: ${gameState?.current_section_id || 'Nueva'}, Sección a Cargar: ${sectionToLoad}`);

    // === 3. OBTENER datos base sección desde campaignData JSON ===
    let sectionData = getSectionFromData(campaignId, sectionToLoad); // Usa la función auxiliar que lee de campaignData
    if (!sectionData || sectionData.id === 'error_section_not_found' || sectionData.id === 'error_campaign_not_found' || sectionData.id === 'error_clone_failed') {
        // Si la función auxiliar devuelve un error o no encuentra la sección
        console.warn(`-> Sección JSON '${sectionToLoad}' no encontrada o inválida en Campaña '${campaignId}'.`);
        return res.status(404).json({ error: sectionData?.description || `Sección ${sectionToLoad} no encontrada en ${campaignId}.` });
    }

    // === 4. FILTRAR opciones basado en estado REAL de DB ===
    //     (Como lo implementamos antes)
    if (sectionData.options && Array.isArray(sectionData.options)) {
        const currentFlags = characterState.gameState.campaign_flags_json || {};
        sectionData.options = sectionData.options.filter(opt => {
             let canShow = true;
             if (opt.hide_if_flag && currentFlags[opt.hide_if_flag]) canShow = false;
             if (canShow && opt.precondition_flag && !opt.precondition_flag.includes('always_available') && !opt.precondition_flag.some(flag => currentFlags[flag])) canShow = false;
             if (canShow && opt.class_req && (!characterState.class || characterState.class.toLowerCase() !== opt.class_req.toLowerCase())) canShow = false;
             return canShow;
        });
        console.log(`   -> Opciones filtradas para sección ${sectionToLoad}. Opciones restantes: ${sectionData.options.length}`);
    } else {
         sectionData.options = sectionData.options || []; // Asegura que siempre sea un array
     }
     // Limpiar datos internos que el frontend no necesita directamente
     if (sectionData.traps) delete sectionData.traps;
     if (sectionData.hazard) delete sectionData.hazard;
     // Podrías añadir aquí la información de los enemigos si esta ruta también la devuelve
     // y escalar sus PVs aquí basado en playerCount si esa info viene en req.body
     if (sectionData.enemies && req.body.playerCount){
         let playerCountNum = parseInt(req.body.playerCount, 10) || 2;
          sectionData.enemies.forEach(enemy => {
               let basePV = enemy.pv_base || 10;
               if (playerCountNum === 3) enemy.scaled_pv = Math.ceil(basePV * 1.25);
               else if (playerCountNum === 4) enemy.scaled_pv = Math.ceil(basePV * 1.5);
               else enemy.scaled_pv = basePV;
               enemy.ui_pv_text = `PV ~${enemy.scaled_pv}`;
           });
      }


    // === 5. DEVOLVER Respuesta al Frontend ===
    console.log(`   -> Enviando datos sección ${sectionToLoad} al frontend.`);
    res.status(200).json({
        nextSectionData: sectionData,           // Objeto con la descripción, opciones filtradas, enemigos (si hay), etc.
        updatedCharacterStats: characterState  // El estado COMPLETO del personaje cargado de la DB (incluyendo gameState)
    });

} catch (error) {
    // --- Manejo de Error 500 (errores inesperados de DB u otros) ---
    console.error("Error GRANDE en /api/get_section:", error);
    res.status(500).json({ error: error.message || "Error interno del servidor al obtener datos de sección." });
}
} );// --- Ruta POST para obtener datos de una sección ---
// --- === RUTA POST /api/get_section (COMPLETA Y REVISADA) === ---
app.post('/api/get_section', async (req, res) => {
    // 1. Extraer Datos del Request Body
    //    (playerCount se envía ahora para posible escalado de enemigos mostrado en descripción)
    const { sectionId, campaignId, characterId, playerCount } = req.body;
    console.log(`[API] GET_SECTION: Camp=${campaignId}, Sect=${sectionId}, Char=${characterId}, Players=${playerCount || 2}`);

    // 2. Validación Básica de Parámetros de Entrada
    if (!campaignId || !sectionId || !characterId) {
        console.warn("[API GetSection] Faltan datos requeridos en la petición.");
        return res.status(400).json({ error: 'Faltan campaignId, sectionId o characterId.' });
    }
    // Convertir playerCount a número o usar default 2
    const playerCountNum = parseInt(playerCount, 10) || 2;

    try {
        // 3. Obtener Estado Actual del Personaje y del Juego desde la Base de Datos
        console.log(`   -> Obteniendo datos para Personaje ID: ${characterId}`);
        const characterState = await db.getCharacter(characterId); // Llama a función real de database.js
        if (!characterState) {
            // Si el personaje no se encuentra, devolver error 404
            console.warn(`[API GetSection] Personaje ${characterId} no encontrado en DB.`);
            return res.status(404).json({ error: `Personaje con ID ${characterId} no encontrado.` });
        }

        const gameState = await db.getGameState(characterId); // Llama a función real de database.js
        // Adjuntar gameState al objeto del personaje. Si no existe gameState, inicializarlo vacío.
        // Poner '1' como sección inicial por defecto si no hay estado guardado.
        characterState.gameState = gameState || { campaign_flags_json: {}, current_section_id: '1' };
        // Asegurarse de que los flags existan como objeto
        characterState.gameState.campaign_flags_json = characterState.gameState.campaign_flags_json || {};


        // 4. Determinar la Sección a Cargar
        //    Si el frontend pide 'current', usar la guardada. Si no, usar la pedida (o '1' si es inválida).
        const sectionToLoad = (sectionId === 'current' && characterState.gameState?.current_section_id)
                            ? characterState.gameState.current_section_id
                            : (sectionId || '1');

        console.log(`   -> Estado Cargado - PJ: ${characterState.name}, Sección en DB: ${gameState?.current_section_id || 'Ninguna'}, Sección a Cargar: ${sectionToLoad}`);

        // 5. Obtener Datos Base de la Sección solicitada desde campaignData JSON
        let sectionData = getSectionFromData(campaignId, sectionToLoad); // Usa la función auxiliar

        // Verificar si la sección se encontró y no es un nodo de error interno
        const possibleErrorIDs = ['error_section_not_found', 'error_campaign_not_found', 'error_clone_failed'];
        if (!sectionData || (sectionData.id && possibleErrorIDs.includes(sectionData.id.toString()))) {
            console.warn(`-> Sección JSON '${sectionToLoad}' no encontrada o inválida en Campaña '${campaignId}'. Razón: ${sectionData?.title || 'No encontrado'}`);
            // Devolver un error 404 específico si la sección no se halló en el JSON
            return res.status(404).json({ error: sectionData?.description || `Sección ${sectionToLoad} no encontrada en campaña.` });
        }


        // 6. Filtrar Opciones de la Sección según Estado Actual del Personaje (Flags, Clase)
        if (sectionData.options && Array.isArray(sectionData.options)) {
            const currentFlags = characterState.gameState.campaign_flags_json || {};
            sectionData.options = sectionData.options.filter(opt => {
                 let canShow = true; // Asumir que se puede mostrar por defecto
                 // Ocultar si tiene flag 'hide_if_flag' y ese flag existe y es true en gameState
                 if (opt.hide_if_flag && currentFlags[opt.hide_if_flag]) {
                    // console.log(`    - Ocultando opción (hide_if_flag: ${opt.hide_if_flag}): "${opt.text}"`);
                    canShow = false;
                 }
                 // Ocultar si requiere flag 'precondition_flag' y NO se cumple (y no es 'always_available')
                 if (canShow && opt.precondition_flag && !opt.precondition_flag.includes('always_available')) {
                    // Debe cumplir AL MENOS UNO de los flags requeridos
                     if (!opt.precondition_flag.some(flag => currentFlags[flag])) {
                        // console.log(`    - Ocultando opción (precondition_flag no cumplido: ${opt.precondition_flag}): "${opt.text}"`);
                        canShow = false;
                     }
                 }
                 // Ocultar si requiere clase específica y el personaje no la tiene
                 if (canShow && opt.class_req && (!characterState.class || characterState.class.toLowerCase() !== opt.class_req.toLowerCase())) {
                     // console.log(`    - Ocultando opción (class_req no cumplido: ${opt.class_req}): "${opt.text}"`);
                      canShow = false;
                  }
                 return canShow; // Devuelve true si la opción debe mostrarse, false si debe ocultarse
            });
            console.log(`   -> Opciones filtradas para ${sectionToLoad}. Visibles: ${sectionData.options.length}`);
        } else {
             sectionData.options = []; // Asegura un array vacío si no había opciones o se filtraron todas
        }

        // 7. (Opcional) Preparar/Escalar datos de enemigos para mostrar en la descripción
        //    Esto calcula los PV escalados ANTES de enviarlos al frontend.
         if (sectionData.enemies && Array.isArray(sectionData.enemies)) {
              console.log(`   -> Escalando PV enemigos para ${playerCountNum} jugadores...`);
              sectionData.enemies.forEach(enemy => {
                   let basePV = enemy.stats?.pv_base || 10;
                   enemy.scaled_pv = basePV; // Iniciar
                   if (playerCountNum === 3) enemy.scaled_pv = Math.ceil(basePV * 1.25);
                   else if (playerCountNum >= 4) enemy.scaled_pv = Math.ceil(basePV * 1.5);
                    // Añadir texto para UI
                    enemy.ui_pv_text = `PV ~${enemy.scaled_pv}`;
               });
          }


        // 8. DEVOLVER la Respuesta Exitosa al Frontend
        console.log(`   -> Enviando datos procesados de sección ${sectionToLoad}.`);
        res.status(200).json({
            nextSectionData: sectionData,          // Objeto de sección con desc., opciones filtradas, enemigos escalados etc.
            updatedCharacterStats: characterState  // Estado ACTUAL del personaje leído de la DB (sin cambios en esta ruta)
        });

    } catch (error) {
        // 9. Manejo de Errores Inesperados (ej: fallo conexión DB en getCharacter/State)
        console.error("Error inesperado en /api/get_section:", error);
        res.status(500).json({ error: "Error interno del servidor al obtener datos de sección." });
    }
}); // <-- FIN DE LA RUTA POST /api/get_section


// --- RUTA /api/make_choice (MODIFICADA PARA USAR createCombat) ---
app.post('/api/make_choice', async (req, res) => {
    // 1. Extraer Datos de la Petición del Frontend
    //    (Incluye la acción que el frontend calculó basado en su tirada)
    const {
        characterId, currentSectionId, campaignId, playerCount, // Contexto
        optionIndex, roll, success,                           // Datos de la Elección/Tirada
        earnedXp, penalty, targetSectionId,                    // Resultados Pre-calculados por JS
        combat_setup, path, flags_set, items_gained, items_lost // Más resultados pre-calculados
    } = req.body;

    console.log(`[API] MAKE_CHOICE: Char=${characterId}, Camp=${campaignId}, From=${currentSectionId}, Opt#=${optionIndex}, Succ=${success}, Players=${playerCount || 2}`);

    // 2. Validación Básica de Input (Esencial para seguridad/estabilidad)
    if (characterId === undefined || currentSectionId === undefined || campaignId === undefined || optionIndex === undefined) {
        console.warn('[API MakeChoice] Error 400: Faltan datos básicos (charId, currentSect, campId, optIdx).');
        return res.status(400).json({ error: 'Datos insuficientes para procesar la elección.' });
    }
    const pCount = parseInt(playerCount, 10) || 2; // Usa playerCount numérico

    try {
        // 3. Cargar Estado Actual del PJ y del Juego desde la DB
        console.log(`   -> Cargando estado para Char ${characterId}...`);
        let character = await db.getCharacter(characterId); // Llama a función real DB
        if (!character) {
             console.warn(`[API MakeChoice] Error 404: Personaje ${characterId} no encontrado.`);
            return res.status(404).json({ error: 'Personaje no encontrado.' });
        }
        const gameState = await db.getGameState(characterId); // Llama a función real DB
        // Adjuntar gameState o uno por defecto al objeto del personaje
        character.gameState = gameState || { campaign_flags_json: {}, current_section_id: currentSectionId || '1' };

        // 4. Validar Consistencia de Sección Actual
        //    Comprueba si la sección guardada en DB coincide con la que dice el frontend
        if (gameState && gameState.current_section_id !== currentSectionId) {
            console.warn(`[API MakeChoice] Conflicto Estado: Frontend en ${currentSectionId}, DB en ${gameState.current_section_id}. Recargando sección correcta (${gameState.current_section_id}).`);
            let correctSectionData = getSectionFromData(campaignId, gameState.current_section_id);
            if (correctSectionData && correctSectionData.options) {
                // Re-filtrar opciones basado en estado REAL de DB
                const currentFlags = character.gameState.campaign_flags_json || {};
                correctSectionData.options = correctSectionData.options.filter(opt => {
                     let canShow = true;
                     if (opt.hide_if_flag && currentFlags[opt.hide_if_flag]) canShow = false;
                     if (canShow && opt.precondition_flag && !opt.precondition_flag.includes('always_available') && !opt.precondition_flag.some(flag => currentFlags[flag])) canShow = false;
                     if (canShow && opt.class_req && (!character.class || character.class.toLowerCase() !== opt.class_req.toLowerCase())) canShow = false;
                    return canShow;
                 });
            }
            // Devolver la sección correcta SIN haber procesado la elección inválida
            return res.status(200).json({
                 message: `Conflicto de estado. Mostrando sección actual desde DB.`,
                 nextSectionData: correctSectionData,
                 updatedCharacterStats: character // Estado de DB sin cambios
             });
          }

        // 5. Procesar la Lógica del Juego (Interpretar Elección y Calcular Resultados)
        //    Llama a la función central que lee campaignData.json
        console.log(`   -> Procesando lógica del juego para la opción ${optionIndex} en sección ${currentSectionId}...`);
         const results = processGameStep(campaignId, currentSectionId, character, req.body); // Pasar TODO el req.body como choiceResult

         // 6. Manejar Error Lógico de processGameStep
        if (results.error) {
            console.warn(`[API MakeChoice] Error lógico: ${results.error}. Recargando sección con feedback.`);
             // Obtiene los datos de la sección actual DE NUEVO
            let currentSectionData = getSectionFromData(campaignId, currentSectionId);
            // Re-Filtrar opciones por si acaso el estado hubiera cambiado (improbable si hubo error antes)
            if (currentSectionData && currentSectionData.options) {
                 const currentFlags = character.gameState.campaign_flags_json || {};
                  currentSectionData.options = currentSectionData.options.filter(opt => {
                     let canShow = true;
                     if (opt.hide_if_flag && currentFlags[opt.hide_if_flag]) canShow = false;
                      if (canShow && opt.precondition_flag && !opt.precondition_flag.includes('always_available') && !opt.precondition_flag.some(flag => currentFlags[flag])) canShow = false;
                     if (canShow && opt.class_req && (!character.class || character.class.toLowerCase() !== opt.class_req.toLowerCase())) canShow = false;
                      return canShow;
                  });
            }
            // Crear copia del personaje y añadirle el feedback de error
            const charWithErrorFeedback = { ...character, feedback_error: results.feedback || results.error };
            // Devolver ESTADO 200 OK, pero con la sección actual y el feedback de error
            return res.status(200).json({ nextSectionData: currentSectionData, updatedCharacterStats: charWithErrorFeedback });
        }


       // --- === 7. MANEJAR CASOS ESPECIALES: Redirección y Inicio Combate === ---

        // Si processGameStep indica redirigir a la selección de campaña
        if (results.targetSectionId === 'REDIRECT_TO_SELECT_CAMPAIGN') {
            console.log("[API MakeChoice] Acción resultó en redirección a select_campaign.html.");
            return res.status(200).json({ redirect: 'select_campaign.html' }); // Envía comando redirect
       }

       // Si processGameStep indica redirigir a la página principal
        if (results.targetSectionId === 'REDIRECT_TO_INDEX') {
            console.log("[API MakeChoice] Acción resultó en redirección a index.html.");
            return res.status(200).json({ redirect: 'index.html' }); // Envía comando redirect
        }

       // Si processGameStep indica iniciar un combate
        if (results.targetSectionId === 'combat_pending') {
            console.log("[API MakeChoice] Estado 'combat_pending' detectado. Iniciando creación combate...");
            if (!results.combatInfo) {
                console.error("[API MakeChoice] Error Crítico: 'combat_pending' sin combatInfo.");
                 return res.status(500).json({error: "Error interno: Faltan datos para iniciar combate."});
            }
            try {
                 // Crear instancia en DB
                 const combatResult = await db.createCombat(characterId, campaignId, currentSectionId, results.combatInfo, playerCount || 2);
                 if (!combatResult || !combatResult.combatId) throw new Error("db.createCombat falló o no devolvió ID.");
                 const combatSectionId = `combat:${combatResult.combatId}`;

                // Actualizar Estado del Jugador a 'en combate' y aplicar efectos pre-combate
                 const updatedCharacterCombat = await db.updateGameState(
                     characterId, campaignId, combatSectionId, results.flagsToSet, results.earnedXp, results.hpChange // TODO: items
                 );
                 if (!updatedCharacterCombat) throw new Error("Fallo al actualizar estado PJ a 'en combate'.");

                 // Devolver Respuesta al Frontend para iniciar UI Combate
                  console.log(`   -> Combate ${combatResult.combatId} creado. Enviando estado inicial.`);
                 res.status(200).json({
                     startCombat: true,
                     combatData: combatResult.initialState,
                     updatedCharacterStats: updatedCharacterCombat
                 });
                 return; // MUY IMPORTANTE: Termina la ejecución aquí

            } catch (combatError) {
                 console.error("[API MakeChoice] Error CRÍTICO durante creación combate:", combatError);
                  return res.status(500).json({ error: `Error interno iniciando combate: ${combatError.message}` });
             }
        }
        // --- === FIN BLOQUE 7 === ---

        // Si no fue ninguno de los casos especiales, continúa con el paso 8 (Actualizar DB para narrativa normal)...

         // 8. Actualizar Base de Datos (Si fue Acción Narrativa Normal)
         console.log(`[API] Acción normal. Actualizando DB: Char ${characterId} -> ${results.targetSectionId}...`);
          const updatedCharacter = await db.updateGameState(
                characterId, campaignId,
                results.targetSectionId, results.flagsToSet,
                results.earnedXp, results.hpChange
                // TODO: results.itemsGained, results.itemsLost
           );
        if(!updatedCharacter) throw new Error("Fallo al guardar cambios post-acción narrativa en DB.");


        // 9. Obtener Datos Nueva Sección (Crudos, para filtrado final)
let nextSectionData = getSectionFromData(campaignId, results.targetSectionId);

// Convertir el ID a string ANTES de usar startsWith
if (!nextSectionData || nextSectionData.id?.toString().startsWith('error')) { // <-- Añadido .toString()
    console.warn(`[API MakeChoice] La sección destino '${results.targetSectionId}' resultó ser una sección de error o no válida.`);
    return res.status(404).json({ error: `Sección destino ${results.targetSectionId} inválida o no encontrada.`});
}


        // --- === 10. FILTRAR OPCIONES DE LA NUEVA SECCIÓN (según estado FINAL PJ) === ---
         // Usa el 'updatedCharacter' que contiene los datos FRESCOS de la DB post-update
         const finalGameState = updatedCharacter.gameState || { campaign_flags_json: {} };

          // Verifica que 'nextSectionData' sea un objeto válido y tenga 'options'
         if (nextSectionData && nextSectionData.options && Array.isArray(nextSectionData.options)) {
              console.log(`   -> Filtrando opciones para Sección ${results.targetSectionId} basado en estado final PJ ${characterId}. Flags:`, finalGameState.campaign_flags_json);
              const originalOptionCount = nextSectionData.options.length;

              nextSectionData.options = nextSectionData.options.filter(opt => {
                  let canShow = true;

                  // Regla 1: Ocultar si tiene 'hide_if_flag' y ese flag está activo
                  if (opt.hide_if_flag && finalGameState.campaign_flags_json[opt.hide_if_flag]) {
                      // console.log(`      - Ocultando (hide_if_flag: ${opt.hide_if_flag}): "${opt.text}"`);
                      canShow = false;
                   }

                   // Regla 2: Ocultar si requiere 'precondition_flag' y NINGUNO se cumple (y no es 'always')
                   if (canShow && opt.precondition_flag && Array.isArray(opt.precondition_flag) && !opt.precondition_flag.includes('always_available')) {
                       // Si el array precondition existe y no incluye 'always_available'
                       // Verifica si ALGUNO ('some') de los flags requeridos existe en el estado final
                       if (!opt.precondition_flag.some(flag => finalGameState.campaign_flags_json[flag])) {
                           // console.log(`      - Ocultando (precondition no cumplido: ${opt.precondition_flag}): "${opt.text}"`);
                            canShow = false;
                       }
                    }

                   // Regla 3: Ocultar si requiere 'class_req' y no coincide
                   if (canShow && opt.class_req) {
                        // Comprueba de forma segura si la clase existe y coincide (ignorando mayús/minús)
                       if (!updatedCharacter?.class || updatedCharacter.class.toLowerCase() !== opt.class_req.toLowerCase()) {
                           // console.log(`      - Ocultando (class_req no cumplido: ${opt.class_req}): "${opt.text}"`);
                            canShow = false;
                        }
                    }

                   return canShow; // Devuelve true si superó todos los filtros, false si no
               }); // Fin del .filter()

              console.log(`      -> Opciones filtradas. Original: ${originalOptionCount}, Final: ${nextSectionData.options.length}`);

          } else {
              // Si 'nextSectionData.options' no existía o no era un array, asegurar que sea un array vacío
              console.log(`   -> Sección ${results.targetSectionId} no tenía opciones o no es un array. Estableciendo a [].`);
              nextSectionData.options = [];
          }

          // Escalar PV enemigos (SI es necesario mostrar info enemiga ANTES del combate en la UI Narrativa)
           // Generalmente, esto ya se hizo en /api/get_section o se manejará al INICIAR combate real.
           // Si de todas formas quieres escalar aquí:
          
           if (nextSectionData.enemies && Array.isArray(nextSectionData.enemies)) {
               let pCount = parseInt(playerCount, 10) || 2; // Usar playerCount global
               nextSectionData.enemies.forEach(enemy => {
                   let basePV = enemy.stats?.pv_base || 10;
                    enemy.scaled_pv = basePV;
                   if (pCount === 3) enemy.scaled_pv = Math.ceil(basePV * 1.25);
                   else if (pCount >= 4) enemy.scaled_pv = Math.ceil(basePV * 1.5);
                    enemy.ui_pv_text = `PV ~${enemy.scaled_pv}`;
                });
            }
           
          // --- === FIN BLOQUE 10 === ---

        // 11. Enviar Respuesta Final al Frontend
         console.log(`   -> Enviando sección ${results.targetSectionId} y PJ actualizado.`);
         res.status(200).json({
             nextSectionData: nextSectionData,          // Datos sección filtrada
             updatedCharacterStats: updatedCharacter    // PJ completo ACTUALIZADO desde DB
         });

    } catch (error) {
        // Captura errores generales de DB o lógica no manejados
        console.error("[API Error GRANDE /make_choice]:", error);
        res.status(500).json({ error: error.message || "Error interno grave al procesar la elección." });
    }
}); // <-- FIN DE LA RUTA POST /api/make_choice

app.post('/api/combat/action', async (req, res) => {
    const { combatId, characterId, action } = req.body; // Acción viene del frontend { type, target_temp_id?, etc }
    console.log(`\n[API] ================= COMBAT ACTION =================`);
    console.log(`[API] Recibido: CombatID=${combatId}, CharID=${characterId}, Action=`, action);

    // Validación de Input Básico
    if (!combatId || !characterId || !action || !action.type) {
        console.warn("[API CombatAction] Error 400: Faltan datos básicos.");
        return res.status(400).json({ error: 'Datos insuficientes para la acción de combate.' });
    }

    let combatConnection = null; // Conexión para la transacción del TURNO COMPLETO (incluyendo IA)
    try {
        // --- 1. OBTENER CONEXIÓN Y ESTADO ACTUAL DEL COMBATE (BLOQUEANDO) ---
        combatConnection = await db.pool.getConnection();
        await combatConnection.beginTransaction(); // Iniciar transacción

        console.log(`   -> Obteniendo estado Combate ID ${combatId} (FOR UPDATE)`);
         // Usamos la conexión transaccional para las lecturas que necesitan bloqueo
        let combatStateData;
        // Función auxiliar interna para obtener estado combate usando la conexión actual
         async function getCombatStateTx(conn, cId) {
            const [rows] = await conn.execute('SELECT * FROM `active_combats` WHERE `combat_id` = ? FOR UPDATE', [cId]);
            if (rows.length === 0) return null;
             const state = rows[0];
             state.combat_state_json = safeJsonParse(state.combat_state_json, null); // Parsear JSON
             if(!state.combat_state_json) throw new Error("JSON de estado combate corrupto o nulo en DB");
             return state;
          }
          combatStateData = await getCombatStateTx(combatConnection, combatId);

        if (!combatStateData) {
            await combatConnection.rollback(); // Liberar bloqueo antes de salir
             console.warn(`[API CombatAction] Error 404: Combate ${combatId} no encontrado.`);
            return res.status(404).json({ error: `Combate ${combatId} no encontrado o ya finalizado.` });
         }

        let combatState = combatStateData.combat_state_json; // Objeto JS del estado
        const currentCampaignId = combatStateData.campaign_id;

        // Validar si ya terminó
        if (combatState.combatEnded) {
             await combatConnection.rollback();
              console.warn(`[API CombatAction] Acción intentada en combate ${combatId} ya finalizado.`);
              return res.status(409).json({ combatEnded: true, victory: combatState.victory, message: "El combate ya terminó." }); // 409 Conflict
         }

        // --- 2. VALIDAR TURNO Y COMBATIENTE ACTIVO ---
        let combatants = combatState.combatants; // Array de todos los participantes
        let currentTurnIndex = combatState.current_turn_index;
        let turnOrder = combatState.turn_order;
        let roundNumber = combatState.round_number;
        const currentCombatantTempId = turnOrder[currentTurnIndex];
        let actingCombatant = combatants.find(c => c.temp_id === currentCombatantTempId);

        if (!actingCombatant) { throw new Error(`Combatiente ${currentCombatantTempId} (turno ${currentTurnIndex}) no hallado en estado ${combatId}`); }
        // Validar si es el PJ correcto quien envía la acción
        if (actingCombatant.is_pj && actingCombatant.original_id !== characterId) {
             await combatConnection.rollback();
            return res.status(403).json({ error: `Turno incorrecto. Es turno de ${actingCombatant.name}, no del personaje ${characterId}.` });
         }
         if (!actingCombatant.is_pj && action.type !== 'ia_simulated') { // Evita que frontend envíe acción en turno IA (a menos que sea un tipo especial)
            await combatConnection.rollback();
            return res.status(403).json({ error: `Acción recibida, pero es turno de la IA (${actingCombatant.name}).` });
         }

         // --- 3. PROCESAR ACCIONES (Jugador + IA hasta sig. PJ o Fin) ---
        let actionLog = []; // Log de este procesamiento
        let combatEnded = false; let victory = false;
        let pjs_activos = combatants.filter(c => c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
        let enemigos_activos = combatants.filter(c => !c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
        let currentAction = action; // La acción del jugador actual (o null si IA empieza)
        let keepProcessingTurns = true; // Flag para controlar bucle IA

         console.log(`[API CombatAction] Procesando Turno ${turnOrder[currentTurnIndex]} (Ronda ${roundNumber})...`);

        while (keepProcessingTurns && !combatEnded) {
            actingCombatant = combatants.find(c => c.temp_id === turnOrder[currentTurnIndex]);
             if (!actingCombatant || actingCombatant.current_pv <= 0 || actingCombatant.status_effects?.includes("derrotado")){
                  // Seguridad: si no se encuentra o está caído, intentar avanzar turno
                   console.log(`   -> Combatiente ${turnOrder[currentTurnIndex]} no encontrado o caído. Saltando turno.`);
                    actionLog.push(`--- ${actingCombatant?.name || turnOrder[currentTurnIndex]} está caído/incapacitado y pierde su turno.`);
                    // Avanzar turno sin procesar acción
             } else {
                // --- === 3a. PROCESAR EFECTOS INICIO TURNO === ---
                 // Esta lógica se ejecuta al comienzo del turno de CADA combatiente (PJ o IA),
                 // ANTES de que realicen su acción principal.
                 let skipActionDueToEffect = false; // Determina si un efecto impide actuar este turno
                 let currentStatusEffects = [...(actingCombatant.status_effects || [])]; // Copia los efectos actuales
                 let effectsToRemove = [];      // IDs de efectos a eliminar tras procesar
                 let logInicioTurno = [];        // Mensajes específicos de esta fase

                 // Solo procesar si hay efectos activos
                 if (currentStatusEffects.length > 0) {
                     logInicioTurno.push(`--- Inicio Turno ${actorName}: Efectos ---`); // Encabezado para el log

                     // Iterar sobre CADA efecto activo en el combatiente
                     currentStatusEffects = currentStatusEffects.map(effectString => {
                         let newEffect = effectString; // Por defecto, el efecto se mantiene para el próximo cálculo

                         // --- Lógica para Efectos Específicos ---

                         // ESTADOS QUE IMPIDEN ACCIÓN (Paralizado, Aturdido, Dormido, etc.)
                          if (effectString.startsWith("paralizado") || effectString.startsWith("status_stunned") || effectString.startsWith("dormido")) {
                              skipActionDueToEffect = true; // Marcar que no podrá actuar
                               let effectName = effectString.split(':')[0].replace('status_',''); // Obtener nombre base
                              logInicioTurno.push(`   Está ${effectName} y no puede realizar acciones.`);
                               // La salvación para estos estados suele ser AL FINAL del turno
                           }

                           // VENENO (status_poisoned)
                           else if (effectString === 'status_poisoned') {
                              const poisonDamage = rollDamage('1d4'); // Daño estándar de veneno (podría venir del efecto si varía)
                              actingCombatant.current_pv = Math.max(0, actingCombatant.current_pv - poisonDamage);
                               logInicioTurno.push(`   Sufre ${poisonDamage} daño por <strong>veneno</strong>. PV: ${actingCombatant.current_pv}/${actingCombatant.max_pv}.`);
                               if (actingCombatant.current_pv === 0) actingCombatant.status_effects.push("derrotado"); // Check si cae por el veneno

                                // Salvación para quitarse el veneno (al INICIO de su turno? O al final? Asumamos inicio)
                                // La CD podría guardarse en el efecto: "status_poisoned:11"
                               let poisonSaveDC = parseInt(effectString.split(':')[1] || '11', 10); // Default CD 11 si no especifica
                               let conStat = actingCombatant.stats_snapshot?.con_mod?.stat || characterState?.stat_constitution || 10; // Usar stat CON guardada o la base
                               let conMod = getModifier(conStat);
                               let poisonSaveRoll = rollD20() + conMod;

                               logInicioTurno.push(`   Intenta superar el veneno (Salva CON ${poisonSaveRoll} vs DC ${poisonSaveDC})...`);
                               if(poisonSaveRoll >= poisonSaveDC){
                                  logInicioTurno.push(`      ✅ ¡Éxito! Se libra del veneno.`);
                                   newEffect = null; // Marcar para eliminar el efecto
                                } else {
                                    logInicioTurno.push(`      ❌ ¡Fallo! Sigue envenenado.`);
                                 }
                           }

                           // SANGRADO (status_bleeding:1d4, status_bleeding:1d6)
                           else if (effectString.startsWith('status_bleeding:')) {
                               const bleedDice = effectString.split(':')[1] || '1d4'; // Dado de daño del sangrado
                               const bleedDamage = rollDamage(bleedDice);
                                actingCombatant.current_pv = Math.max(0, actingCombatant.current_pv - bleedDamage);
                                logInicioTurno.push(`   Sufre ${bleedDamage} daño por <strong>sangrado</strong>. PV: ${actingCombatant.current_pv}/${actingCombatant.max_pv}.`);
                               if (actingCombatant.current_pv === 0) actingCombatant.status_effects.push("derrotado");

                                // Salvación CON para parar el sangrado (o una acción de Medicina)
                                // Podríamos definir la CD en el efecto: "status_bleeding:1d4:12"
                                let bleedSaveDC = parseInt(effectString.split(':')[2] || '12', 10); // Default CD 12
                                let conStatB = actingCombatant.stats_snapshot?.con_mod?.stat || characterState?.stat_constitution || 10;
                                let conModB = getModifier(conStatB);
                                let bleedSaveRoll = rollD20() + conModB;

                                logInicioTurno.push(`   Intenta detener la hemorragia (Salva CON ${bleedSaveRoll} vs DC ${bleedSaveDC})...`);
                                if(bleedSaveRoll >= bleedSaveDC){
                                     logInicioTurno.push(`      ✅ ¡Éxito! La herida coagula.`);
                                      newEffect = null; // Marcar para eliminar
                                 } else {
                                      logInicioTurno.push(`      ❌ ¡Fallo! Sigue sangrando.`);
                                  }
                           }

                            // QUEMADO (status_burning:1d6) - Similar a Sangrado pero con posible daño a objetos?
                            else if (effectString.startsWith('status_burning:')) {
                                const burnDice = effectString.split(':')[1] || '1d6';
                                const burnDamage = rollDamage(burnDice);
                                 actingCombatant.current_pv = Math.max(0, actingCombatant.current_pv - burnDamage);
                                 logInicioTurno.push(`   Sufre ${burnDamage} daño por <strong>quemaduras</strong>. PV: ${actingCombatant.current_pv}/${actingCombatant.max_pv}.`);
                                 if (actingCombatant.current_pv === 0) actingCombatant.status_effects.push("derrotado");
                                 // Podría requerir acción para apagar o salvación DES? Por ahora no termina solo.
                                  logInicioTurno.push(`   Sigue ardiendo.`);
                            }

                           // REGENERACIÓN (status_regen:2) - Recupera PV al inicio
                           else if (effectString.startsWith('status_regen:')) {
                               const regenAmount = parseInt(effectString.split(':')[1] || '1', 10);
                                actingCombatant.current_pv = Math.min(actingCombatant.max_pv, actingCombatant.current_pv + regenAmount);
                                logInicioTurno.push(`   Regenera ${regenAmount} PV. PV: ${actingCombatant.current_pv}/${actingCombatant.max_pv}.`);
                               // La regeneración no suele desaparecer sola, se mantiene el efecto
                           }


                            // REDUCIR DURACIÓN de otros efectos temporales con formato 'nombre:turnos'
                           // Ej: "hechizado:3", "asustado:2"
                           else if (effectString.includes(':')) {
                                let [name, duration] = effectString.split(':');
                                let durationNum = parseInt(duration, 10);
                                // Solo reducir si es un número válido > 0
                                if (!isNaN(durationNum) && durationNum > 0) {
                                     durationNum -= 1; // Reduce la duración en 1
                                     if (durationNum > 0) {
                                         newEffect = `${name}:${durationNum}`; // Actualiza la duración restante
                                         logInicioTurno.push(`   Efecto ${name} durará ${durationNum} turno(s) más.`);
                                     } else {
                                         logInicioTurno.push(`   Efecto ${name} termina.`);
                                         newEffect = null; // Marcar para eliminar porque llegó a 0
                                      }
                                 }
                                // Si no tiene duración numérica válida, mantener efecto como estaba
                            }


                           return newEffect; // Devuelve el efecto (modificado o no) o null si debe quitarse
                      }).filter(eff => eff !== null); // Elimina los efectos marcados como null

                       // Actualizar el array de efectos del combatiente en el estado del combate
                       actingCombatant.status_effects = currentStatusEffects;

                       // Añadir logs generados al log principal del turno
                       actionLog.push(...logInicioTurno);

                  } // --- Fin if(hay efectos) ---


                 // 3b. EJECUTAR ACCIÓN PRINCIPAL (Si no está incapacitado/skip)
                 if (!skipAction && actingCombatant.current_pv > 0 && !actingCombatant.status_effects.includes("derrotado")) {
                    if (!actingCombatant.is_pj) {
                        // --- Lógica IA Enemiga ---
                        actionLog.push(`--- Turno Enemigo: ${actingCombatant.name} ---`);
                        let targetPJ = pjs_activos.sort((a,b) => a.current_pv - b.current_pv)[0]; // Ataca al PJ con MENOS PV vivos
                         if (targetPJ) {
                             // Usar función resolveAttack con primer ataque definido
                              const attackData = actingCombatant.stats_snapshot?.ataques?.[0];
                             if (attackData) {
                                 const attackResult = resolveAttack(actingCombatant, targetPJ, attackData);
                                  actionLog.push(...attackResult.logMessages);
                                  // Actualizar lista PJs activos si objetivo cayó
                                   if(targetPJ.current_pv === 0) pjs_activos = combatants.filter(c => c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
                              } else { actionLog.push(`   ${actingCombatant.name} duda (sin ataque).`); }
                         } else { actionLog.push(`   ${actingCombatant.name} no ve objetivos válidos.`); }
                     }
                    else if (currentAction) {
                         // --- Procesar Acción Recibida del Jugador ---
                        actionLog.push(`--- Turno PJ: ${actorName} ---`);
                        switch (currentAction.type.toLowerCase()) {
                             case 'attack': {
                                  const target = combatants.find(c => c.temp_id === currentAction.target_temp_id);
                                 if (!target || target.current_pv <= 0 || target.is_pj) { actionLog.push("Objetivo inválido."); }
                                  else {
                                     const pjAttackData = { nombre: "Ataque PJ", bono_ataque: actingCombatant.stats_snapshot?.ataque_principal_bono || "+0", dano: actingCombatant.stats_snapshot?.ataque_principal_dano || "1d6" }; // Leer datos ataque REAL del PJ
                                      const attackResult = resolveAttack(actingCombatant, target, pjAttackData);
                                      actionLog.push(...attackResult.logMessages);
                                      if(target.current_pv === 0) enemigos_activos = combatants.filter(c => !c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado")); // Recalcular
                                   }
                                  break;
                              }
                              // ... CASOS cast_spell, use_item, dodge, move, end_turn (con lógica PENDIENTE/SIMULADA como antes) ...
                              default: actionLog.push(`Acción ${currentAction.type} no procesada.`); break;
                         }
                         keepProcessingTurns = false; // Detener tras acción PJ, esperar siguiente comando
                     } else if (actingCombatant.is_pj){
                         // ¡Error! Es turno del PJ pero no recibimos acción en la API. Esto no debería pasar si el frontend espera.
                          console.error(`[API CombatAction] Error Lógico: Turno del PJ ${actingCombatant.name} pero 'currentAction' es nulo.`);
                         actionLog.push(`*** ${actingCombatant.name}, es tu turno pero no se recibió acción. Finalizando turno. ***`);
                         keepProcessingTurns = false; // Esperar acción frontend
                         // Podríamos devolver error aquí si quisiéramos ser estrictos
                      }
                 } // Fin if (!skipAction...)

                  // --- === 3c. PROCESAR EFECTOS FIN TURNO === ---
                   // Esta lógica se ejecuta después de que un combatiente (PJ o IA) ha realizado su acción,
                   // pero ANTES de comprobar si el combate ha terminado definitivamente o de pasar al siguiente turno.
                   if (actingCombatant.status_effects && actingCombatant.status_effects.length > 0) {
                    // Crear array para nuevo estado y log específico de esta fase
                   let logFinTurno = [];
                   let nextTurnStatusEffects = []; // Almacenará los efectos que continúan

                   console.log(`   -> Procesando Efectos Fin Turno para ${actorName}: [${actingCombatant.status_effects.join(', ')}]`);
                   logFinTurno.push(`--- Fin Turno ${actorName}: Efectos ---`);

                    // Iterar sobre CADA efecto que TENÍA el combatiente al inicio de esta fase
                   for (const effectString of actingCombatant.status_effects) {
                        let keepEffect = true; // Asume que el efecto continúa por defecto

                        // --- Salvaciones al Final del Turno ---
                        // Ej: Paralizado (Salva CON CD 10 para terminar)
                         if (effectString.startsWith("paralizado")) {
                            let paralizadoSaveDC = parseInt(effectString.split(':')[1] || '10', 10); // Leer CD si se guardó: "paralizado:10"
                            let conStatP = actingCombatant.stats_snapshot?.con_mod?.stat || character?.stat_constitution || 10;
                            let conModP = getModifier(conStatP);
                            let paralizadoSaveRoll = rollD20() + conModP;
                             logFinTurno.push(`   Intenta librarse de la Parálisis (Salva CON ${paralizadoSaveRoll} vs DC ${paralizadoSaveDC})...`);
                            if (paralizadoSaveRoll >= paralizadoSaveDC) {
                                 logFinTurno.push(`      ✅ ¡Éxito! Se libra.`);
                                 keepEffect = false; // El efecto se elimina
                             } else { logFinTurno.push(`      ❌ ¡Fallo! Sigue paralizado.`); }
                         }
                          // Podrías añadir aquí otras salvaciones al final del turno (ej: Miedo SAB)

                        // --- Eliminar Estados Temporales de Acción ---
                        // Ej: Esquivando (Solo dura hasta el final de este turno)
                        if (effectString === 'esquivando') {
                             logFinTurno.push(`   Deja de esquivar activamente.`);
                             keepEffect = false;
                         }

                        // --- Gestionar Efectos con Duración Numérica ---
                        // (Esto ya se hizo al *inicio* del turno para efectos como 'hechizado:3', pero podrías tener lógica adicional aquí si fuera necesario)

                        // --- Mantener Efectos Continuos/Sin Lógica de Fin ---
                        // Ej: Envenenado, Sangrando, Quemado (se chequean al inicio)
                        // No hacemos nada especial aquí, solo verificamos si se deben mantener

                       // Añadir el efecto al nuevo array SI debe mantenerse
                        if (keepEffect) {
                            nextTurnStatusEffects.push(effectString);
                        }
                    } // Fin for (efectos)

                    // Actualizar los efectos del combatiente en el estado de combate con la lista filtrada/actualizada
                    actingCombatant.status_effects = nextTurnStatusEffects;

                   // Solo añadir logs si hubo cambios o checks
                   if (logFinTurno.length > 1) { // Mayor que 1 para ignorar solo el encabezado "--- Fin Turno..."
                       actionLog.push(...logFinTurno);
                   }

                } // --- Fin if(hay efectos) ---

               // --- === FIN BLOQUE 3c === ---


             } // Fin if (actingCombatant vivo y no incapacitado)

             // --- COMPROBAR FIN COMBATE POST-TURNO ---
              pjs_activos = combatants.filter(c => c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
              enemigos_activos = combatants.filter(c => !c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
              if (enemigos_activos.length === 0 || pjs_activos.length === 0) {
                 combatEnded = true; victory = (enemigos_activos.length === 0); keepProcessingTurns = false;
                 console.log(`[API Combat] Fin combate detectado. Victoria=${victory}`); break; // Salir del while
              }

             // --- AVANZAR TURNO (si keepProcessingTurns) ---
              if (keepProcessingTurns) {
                   currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
                   combatState.current_turn_index = currentTurnIndex;
                    if (currentTurnIndex === 0) { combatState.round_number++; actionLog.push(`*** Inicio Ronda ${combatState.round_number} ***`); }
                    // Si el SIGUIENTE es PJ, parar bucle IA para esperar acción frontend
                    if (combatants[currentTurnIndex]?.is_pj) { keepProcessingTurns = false; console.log(`   -> Próximo turno es del PJ ${combatants[currentTurnIndex]?.name}. Esperando.`);}
                }

        } // --- FIN While Procesamiento Turnos ---


        // --- 8. GUARDAR ESTADO DB y PREPARAR RESPUESTA ---
         combatState.combat_log.push(...actionLog); // Añadir log del último bloque procesado
         if(combatState.combat_log.length > 70) combatState.combat_log = combatState.combat_log.slice(-70); // Limitar log

         let responseData = {}; let updatedCharacter; // PJ principal a devolver

        if (combatEnded) { // Si el combate terminó en este bloque...
            console.log(`[API CombatAction] Resolviendo Fin Combate (Victoria=${victory}).`);
            let totalCombatXp = 0;
            if (victory) {
               totalCombatXp = combatants.reduce((sum, c) => {
                   if (!c.is_pj) {
                       const xpVal = c.stats_snapshot?.xp_value || campaignData[currentCampaignId]?.[c.original_id]?.stats?.xp_value || 50;
                       return sum + xpVal;
                    } return sum;
                }, 0);
               console.log(`   -> XP por Victoria: ${totalCombatXp}`);
               actionLog.push(`Recompensa por victoria: +${totalCombatXp} XP.`);
            }

             const finalSectionId = victory ? combatState.target_section_win : combatState.target_section_loss;

            // BORRAR combate de la DB (¡Usando la conexión de la transacción!)
             await connection.execute('DELETE FROM `active_combats` WHERE `combat_id` = ?', [combatId]);

            // ACTUALIZAR estado del PJ PRINCIPAL y su game_state
            //   Obtener el último estado de PV conocido del PJ en el combate
            const finalPJCombatData = combatants.find(c => c.original_id === characterId && c.is_pj);
            const finalPv = finalPJCombatData ? finalPJCombatData.current_pv : 0; // Usar 0 si no se encuentra o cayó

            //   Obtener XP actual de la DB para sumar el nuevo
            const [charCurrentData] = await connection.execute('SELECT xp, level FROM characters WHERE character_id = ? FOR UPDATE', [characterId]);
             if(charCurrentData.length === 0) throw new Error(`PJ ${characterId} no encontrado para update final.`);
            const newTotalXP = (charCurrentData[0].xp || 0) + totalCombatXp;
            let finalLevel = charCurrentData[0].level; // TODO: Lógica Nivel Up basada en newTotalXP

            console.log(`   -> Actualizando PJ ${characterId}: XP=${newTotalXP}, PV=${finalPv}, Sección=${finalSectionId}`);
            // Update characters
             await connection.execute(
                'UPDATE `characters` SET `xp` = ?, `pv_current` = ?, `level` = ?, `updated_at` = NOW() WHERE `character_id` = ?',
                [newTotalXP, finalPv, finalLevel, characterId]
             );
             // Update game_state (asegurarse de que actualice aunque ya exista)
              const finalFlagsJSON = JSON.stringify(combatState.combatants.find(c => c.original_id === characterId && c.is_pj)?.gameState?.campaign_flags_json || {}); // Usa flags actuales si no se pasaron nuevos
             await connection.execute(
                 `INSERT INTO game_state (character_id, campaign_id, current_section_id, campaign_flags_json, last_saved_at) VALUES (?, ?, ?, ?, NOW())
                  ON DUPLICATE KEY UPDATE campaign_id = VALUES(campaign_id), current_section_id = VALUES(current_section_id), last_saved_at = NOW()`, // No sobreescribe flags aquí por simplicidad
                  [characterId, currentCampaignId, finalSectionId, finalFlagsJSON] // JSON_OBJECT() podría ser mejor para resetear si es necesario
              );

              finalCharacterState = await db.getCharacter(characterId); // Volver a cargar TODO el estado final
               finalCharacterState.gameState = await db.getGameState(characterId);

               // Preparar respuesta FIN
              responseData = { combatEnded: true, victory: victory, finalLog: actionLog, earnedXp: totalCombatXp, nextSectionData: getSectionFromData(currentCampaignId, finalSectionId), updatedCharacterStats: finalCharacterState };

        } else { // Si el combate continúa...
            // ACTUALIZAR estado de combate en DB (usando la conexión)
             await connection.execute('UPDATE `active_combats` SET `combat_state_json` = ?, `updated_at` = NOW() WHERE `combat_id` = ?', [JSON.stringify(combatState), combatId]);
            console.log(`   -> Estado combate ${combatId} actualizado en DB.`);

            // Preparar respuesta CONTINUACIÓN
             responseData = { combatEnded: false, turnLog: actionLog, combatState: combatState, updatedCharacterStats: combatants.find(c => c.original_id === characterId && c.is_pj) };
        }

        // --- 9. COMMIT y RESPUESTA ---
        await combatConnection.commit(); // Confirma cambios en DB
        console.log(`   -> Tx Combate ${combatId} Confirmada.`);
        res.status(200).json(responseData);

    } catch (error) { // Manejo error general de la ruta
        if (combatConnection) await combatConnection.rollback();
        console.error("[API Error /combat/action]:", error);
        res.status(500).json({ error: error.message || "Error interno procesando acción combate." });
    } finally {
        if (combatConnection) combatConnection.release(); // Liberar conexión
    }
}); // <-- FIN RUTA /api/combat/action

// --- Iniciar Servidor ---
// ... (Código app.listen con db.testConnection() como antes) ...
const PORT = process.env.PORT || 3000;
db.testConnection().then(dbOk => {
    if (dbOk) { app.listen(PORT, () => console.log(`🚀 Server ready at http://localhost:${PORT}`)); }
    else { console.error("⛔ Server NOT started due to DB connection issues."); process.exit(1); }
}).catch(err => { console.error("💥 Unexpected error during DB test:", err); process.exit(1); });