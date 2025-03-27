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
try { /* ... carga campaignData ... */ console.log("✅ Datos campaña cargados.");} catch (error) { console.error(" FATAL ERROR cargando JSON:", error.message); process.exit(1); }

// --- Función Lógica Central 'processGameStep' ---
// (Como en la respuesta anterior - Calcula earnedXp, hpChange, flagsToSet, targetSectionId, combatInfo, etc.)
// MODIFICACIÓN: Cuando determina combate, targetSectionId debe ser algo como "combat_pending" o similar
//               para que la ruta /api/make_choice lo detecte.
function processGameStep(campaignId, currentSectionId, characterState, choiceResult) {
    console.log(`[Logic] Processing step: Camp=${campaignId}, Sect=${currentSectionId}, Choice=`, choiceResult);
    // ... (Obtener currentSectionData, inicializar characterState/gameState, calculatedResults ... )

    let nextSteps = {};
    let chosenOption = null;

     if (choiceResult && choiceResult.optionIndex !== undefined && currentSectionData.options && currentSectionData.options[choiceResult.optionIndex]) {
        chosenOption = currentSectionData.options[choiceResult.optionIndex];
         // ... (Validación Precondiciones ...)
        if (/* !canChoose */ false) { return calculatedResults; } // Recargar si no puede elegir

        // ... (Determinar nextSteps según tirada/directo ...)
         if (chosenOption.check && choiceResult.success !== undefined) { /* ... éxito/fallo/parcial ... */ }
         else if (chosenOption.next) { nextSteps = chosenOption.next; }
         else { calculatedResults.targetSectionId = currentSectionId; } // Quedarse por defecto si no hay 'next'

     } else if (currentSectionData.next_section) { /* ... continuación directa ... */ }
     // ... (Error si no hay nada) ...


    // --- APLICAR RESULTADOS (XP, Penalty, Flags, Items) ---
    calculatedResults.earnedXp = (calculatedResults.earnedXp || 0) + (nextSteps.xp || 0);
    calculatedResults.penaltyApplied = nextSteps.penalty || null;
    calculatedResults.flagsToSet = nextSteps.flags_set || {};
    calculatedResults.feedback = nextSteps.feedback || calculatedResults.feedback;

     // --- Determinar Sección Destino Final ---
     if (nextSteps.sectionId) calculatedResults.targetSectionId = nextSteps.sectionId;
     // Resolver target especiales
     if (calculatedResults.targetSectionId === "USE_TARGET_SECTION_VAR" && choiceResult) { calculatedResults.targetSectionId = choiceResult.targetSectionAfterCombat || 'error'; }

     // --- RESOLVER ITEMS Y HP CHANGE (como antes) ---
      function rollDamage(dStr = '0'){ /*...*/ }
      calculatedResults.itemsGained = (nextSteps.items_gained || []).map(resolveItemQuantity).filter(i=>i);
      calculatedResults.itemsLost = (nextSteps.items_lost || []).map(itemDef => ({item_id: typeof itemDef === 'string'?itemDef:itemDef.item_id, quantity:itemDef.quantity||1})).filter(i=>i.item_id);
      let hpLost = 0; let hpGained = 0;
      if (calculatedResults.penaltyApplied) { /* ... calcular hpLost ... */ }
      if (nextSteps.gain_hp) { hpGained = rollDamage(nextSteps.gain_hp); }
      calculatedResults.hpChange = hpGained - hpLost;


    // --- !!! MODIFICACIÓN CLAVE: Preparar Combat Info !!! ---
    // Si la lógica original de nextSteps apuntaba a "combat",
    // cambiamos targetSectionId a "combat_pending" y preparamos combatInfo.
    if (calculatedResults.targetSectionId === 'combat') {
        console.log("[Logic] Preparando información para iniciar combate...");
         calculatedResults.combatInfo = {
            setup: nextSteps.combat_setup || 'normal',
            targetSectionAfterCombat: nextSteps.targetSectionAfterCombat || 'error', // MUY IMPORTANTE: a dónde ir tras ganar
            enemies: nextSteps.enemy_data || currentSectionData.enemies || [], // Enemigos para este combate
            // Añadir contexto adicional si es necesario
            origin_section: currentSectionId
         };
         calculatedResults.targetSectionId = 'combat_pending'; // SEÑAL para /api/make_choice
         console.log(`[Logic] Combate pendiente. Info: Setup=${calculatedResults.combatInfo.setup}, PostCombat=${calculatedResults.combatInfo.targetSectionAfterCombat}`);
    }

    console.log("[Logic] Final Calculated Results:", calculatedResults);
    return calculatedResults;
}
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
app.post('/api/get_section', async (req, res) => { // <-- INICIO DE LA RUTA
    const { sectionId, campaignId, characterId } = req.body;
    console.log(`[API] GET_SECTION: Camp=${campaignId}, Sect=${sectionId}, Char=${characterId}`);

    // Validación básica
    if (!campaignId || !sectionId || !characterId) {
        return res.status(400).json({ error: 'Faltan campaignId, sectionId o characterId.' });
    }

    try {
        // 1. OBTENER PJ y ESTADO desde DB
        const characterState = await db.getCharacter(characterId);
        if (!characterState) {
             return res.status(404).json({ error: `Personaje con ID ${characterId} no encontrado.` });
        }
        const gameState = await db.getGameState(characterId);
        characterState.gameState = gameState || { campaign_flags_json: {}, current_section_id: '1' };

        // 2. DETERMINAR sección a cargar
        const sectionToLoad = (sectionId === 'current' && gameState?.current_section_id)
                            ? gameState.current_section_id
                            : (sectionId || '1');

        console.log(`   -> Intentando cargar estado PJ: ${characterState.name}, Sección DB: ${gameState?.current_section_id || 'Nueva'}, Sección a Cargar: ${sectionToLoad}`);

        // 3. OBTENER datos base sección
        let sectionData = getSectionFromData(campaignId, sectionToLoad);
        if (!sectionData || sectionData.id?.startsWith('error')) {
             console.warn(`-> Sección JSON '${sectionToLoad}' no encontrada o inválida.`);
            return res.status(404).json({ error: sectionData?.description || `Sección ${sectionToLoad} no encontrada.` });
         }

        // 4. FILTRAR opciones
        if (sectionData.options && Array.isArray(sectionData.options)) {
            const currentFlags = characterState.gameState.campaign_flags_json || {};
             // ... (Lógica de filtrado completa por flags y clase) ...
             sectionData.options = sectionData.options.filter(opt => {
                let canShow = true;
                if (opt.hide_if_flag && currentFlags[opt.hide_if_flag]) canShow = false;
                if (canShow && opt.precondition_flag && !opt.precondition_flag.includes('always_available') && !opt.precondition_flag.some(flag => currentFlags[flag])) canShow = false;
                if (canShow && opt.class_req && (!characterState.class || characterState.class.toLowerCase() !== opt.class_req.toLowerCase())) canShow = false;
                return canShow;
             });
        } else { sectionData.options = []; }
        // Limpiar/preparar datos y escalar enemigos si aplica...
        if(sectionData.enemies && req.body.playerCount) { /* ... Escalar PVs aquí ... */}


        // 5. DEVOLVER Respuesta
        console.log(`   -> Enviando datos sección ${sectionToLoad}.`);
        res.status(200).json({
            nextSectionData: sectionData,
            updatedCharacterStats: characterState
        });

    } catch (error) {
        console.error("Error en /api/get_section:", error);
        res.status(500).json({ error: "Error interno servidor." });
    }
}); // <-- FIN DE LA RUTA POST /api/get_section


// --- RUTA /api/make_choice (MODIFICADA PARA USAR createCombat) ---
app.post('/api/make_choice', async (req, res) => {
    const { characterId, currentSectionId, campaignId, optionIndex, roll, success, playerCount } = req.body;
    console.log(`[API] MAKE_CHOICE: Char=${characterId}, Camp=${campaignId}, From=${currentSectionId}, Opt#=${optionIndex}, Succ=${success}, Players=${playerCount || 2}`);
    // ... (Validaciones input) ...
    if (!characterId || !campaignId || !currentSectionId || optionIndex === undefined) return res.status(400).json({ error: 'Datos insuficientes.' });

    try {
        // 1. Cargar Estado Actual PJ + Juego desde DB
        const character = await db.getCharacter(characterId);
        if (!character) return res.status(404).json({ error: 'Personaje no encontrado.' });
        const gameState = await db.getGameState(characterId);
        character.gameState = gameState || { campaign_flags_json: {}, current_section_id: currentSectionId || '1' };
        // ... (Validar sección actual vs gameState) ...

        // 2. Procesar Lógica con processGameStep -> obtiene 'results'
        const results = processGameStep(campaignId, currentSectionId, character, req.body);
        if (results.error) { /* ... Devolver error lógico al frontend ... */ }


        // 3. Manejar Casos Especiales (Redirección)
        if (results.targetSectionId === 'REDIRECT_TO_SELECT_CAMPAIGN') return res.status(200).json({ redirect: 'select_campaign.html' });
        if (results.targetSectionId === 'REDIRECT_TO_INDEX') return res.status(200).json({ redirect: 'index.html' });

        // --- === 4. MANEJO DE INICIO DE COMBATE (ESTA ES LA PARTE RELEVANTE) === ---
        if (results.targetSectionId === 'combat_pending') {
            console.log("[API] Estado 'combat_pending' detectado. Llamando a db.createCombat...");
            if (!results.combatInfo) throw new Error("Error lógico: combat_pending sin combatInfo.");

            try {
                // a. Crear Instancia de Combate en DB (Usa función REAL de database.js)
                 const combatResult = await db.createCombat(
                     characterId, campaignId, currentSectionId, results.combatInfo, playerCount || 2
                 );
                 if (!combatResult || !combatResult.combatId || !combatResult.initialState) {
                     throw new Error("db.createCombat no devolvió la estructura esperada.");
                 }
                 const newCombatId = combatResult.combatId;
                 const initialStateJSON = combatResult.initialState;
                 const combatSectionId = `combat:${newCombatId}`; // ID "virtual" sección

                 // b. Actualizar game_state del PJ en DB (Usa función REAL de database.js)
                  const updatedCharacterCombat = await db.updateGameState(
                     characterId, campaignId, combatSectionId, results.flagsToSet,
                     results.earnedXp, results.hpChange
                 );
                  if (!updatedCharacterCombat) throw new Error("No se pudo actualizar estado PJ a 'en combate'.");

                 // c. Devolver Respuesta para iniciar UI Combate
                  console.log(`[API] Combate ${newCombatId} iniciado. Enviando estado inicial.`);
                  res.status(200).json({
                     startCombat: true, combatData: initialStateJSON,
                     updatedCharacterStats: updatedCharacterCombat
                 });
                return; // *** Terminar aquí ***

             } catch (combatError) { /* ... Manejo error creación combate ... */ }
        }
        // --- === FIN MANEJO INICIO DE COMBATE === ---


        // 5. Actualizar Base de Datos (Si NO fue combate ni redirección)
         console.log(`[API] Acción normal detectada. Actualizando DB para Char ${characterId} a Sección ${results.targetSectionId}...`);
         const updatedCharacter = await db.updateGameState(
                 characterId, campaignId,
                 results.targetSectionId, results.flagsToSet,
                 results.earnedXp, results.hpChange
                  // TODO: results.itemsGained, results.itemsLost
            );
         if(!updatedCharacter) throw new Error("Fallo en DB update post-acción.");

        // 6. Obtener Datos Nueva Sección (Crudos)
        let nextSectionData = getSectionFromData(campaignId, results.targetSectionId);
        if (!nextSectionData) return res.status(404).json({ error: `Sección ${results.targetSectionId} no hallada.`});

        // 7. Filtrar Opciones Nueva Sección
        if(nextSectionData.options){ /* ... Filtrar basado en updatedCharacter.gameState ... */ }

        // 8. Enviar Respuesta Final
        res.status(200).json({ nextSectionData: nextSectionData, updatedCharacterStats: updatedCharacter });

    } catch (error) {
        console.error("[API Error /make_choice]:", error);
        res.status(500).json({ error: error.message || "Error interno al procesar elección." });
    }
});

app.post('/api/combat/action', async (req, res) => {
    const { combatId, characterId, action } = req.body;
    console.log(`\n[API] COMBAT_ACTION: CombatID=${combatId}, CharID=${characterId}, Action=`, action);
    // ... (Validación Input Inicial igual que antes) ...

    let combatConnection;
    try {
        // 1. Obtener Conexión e Iniciar Transacción, Cargar/Bloquear Estado Combate
        combatConnection = await db.pool.getConnection();
        await combatConnection.beginTransaction();

        const [combatRows] = await combatConnection.execute(
            'SELECT * FROM `active_combats` WHERE `combat_id` = ? FOR UPDATE', [combatId]
        );
        if (combatRows.length === 0) { /* ... manejo combate no encontrado ... */ await combatConnection.rollback(); return res.status(404).json({ error: 'Combate activo no encontrado.' }); }
        let combatState = combatRows[0];
        try { combatState.combat_state_json = JSON.parse(combatState.combat_state_json); }
        catch (e) { throw new Error(`Estado JSON corrupto (CombatID: ${combatId})`); }

        let combatants = combatState.combat_state_json.combatants;
        let currentTurnIndex = combatState.combat_state_json.current_turn_index;
        let turnOrder = combatState.combat_state_json.turn_order;
        const currentCampaignId = combatState.campaign_id; // Usar campaignId del estado de combate guardado

        // 2. Validar Turno del Personaje
        const currentCombatantTempId = turnOrder[currentTurnIndex];
        const actingCombatant = combatants.find(c => c.temp_id === currentCombatantTempId);
        if (!actingCombatant) throw new Error("Combatiente actual no encontrado.");
        if (actingCombatant.is_pj && actingCombatant.original_id !== characterId) { /* ... manejo turno incorrecto ... */ await combatConnection.rollback(); return res.status(403).json({ error: 'No es el turno de este personaje.' });}


        // --- 3. PROCESAR ACCIÓN DEL JUGADOR ---
        let actionLog = [`--- Turno PJ: ${actingCombatant.name} (Ronda ${combatState.combat_state_json.round_number}) ---`];
        console.log(`   -> Procesando Acción PJ: ${actingCombatant.name} realiza ${action.type}`);

        switch (action.type.toLowerCase()) {
            // ... (CASOS: 'attack', 'cast_spell', 'dodge', 'move', 'use_item' como antes) ...
             case 'attack': {
                const target = combatants.find(c => c.temp_id === action.target_temp_id);
                if (!target || target.current_pv <= 0) { actionLog.push("Objetivo inválido."); break; }
                 // ... (resto lógica ataque: tirada, daño, check caída objetivo) ...
                 actionLog.push(/* Mensaje resultado ataque */);
             } break;
            // ... otros casos ...
             default: actionLog.push(`Acción ${action.type} no reconocida.`); break;
        }

        // --- 4. FIN TURNO PJ / PROCESAR EFECTOS FIN TURNO ---
        // ... (Lógica para quitar/actualizar status_effects temporales) ...


        // --- 5. COMPROBAR FIN COMBATE POST-ACCIÓN PJ ---
        let pjs_activos = combatants.filter(c => c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado")); // Asegura no contar los ya derrotados
        let enemigos_activos = combatants.filter(c => !c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado"));
        let combatEnded = (enemigos_activos.length === 0 || pjs_activos.length === 0);
        let victory = (combatEnded && enemigos_activos.length === 0);


        // --- 6. AVANZAR TURNO y EJECUTAR IA (SI NO ACABÓ) ---
        let nextTurnIndex = currentTurnIndex; // Se actualizará si no acabó
        if (!combatEnded) {
             nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
             combatState.combat_state_json.current_turn_index = nextTurnIndex;
              if (nextTurnIndex === 0) { // Inicio nueva ronda
                 combatState.combat_state_json.round_number++;
                 console.log(`   -> Iniciando Ronda ${combatState.combat_state_json.round_number}`);
                 actionLog.push(`*** Inicio Ronda ${combatState.combat_state_json.round_number} ***`);
                 // Resetear acciones usadas, aplicar regeneración/daño continuo inicio ronda, etc.
             }

             // Bucle Turnos IA hasta próximo PJ o fin combate
             while (!combatants[nextTurnIndex]?.is_pj && !combatEnded) {
                 const enemyCombatant = combatants[nextTurnIndex];
                  if (enemyCombatant.current_pv > 0 && !enemyCombatant.status_effects.includes("aturdido")) {
                      console.log(`   -> Ejecutando Turno IA para ${enemyCombatant.name}`);
                      actionLog.push(`--- Turno Enemigo: ${enemyCombatant.name} ---`);
                       // Ejecutar IA (Atacar PJ < PV) - Misma lógica simulada que antes
                       // ... (Buscar targetPJ, Simular ataque, Aplicar daño, Añadir a actionLog) ...
                       if (targetPJ) {
                            // ... Simular ataque ...
                           if (impacto) {
                                targetPJ.current_pv -= damageDealtE;
                                 actionLog.push(`      ➡️ ¡Impacto! ${targetPJ.name} recibe ${damageDealtE} daño...`);
                                if (targetPJ.current_pv <= 0) {
                                    targetPJ.current_pv = 0;
                                     targetPJ.status_effects.push("derrotado"); // O 'moribundo'
                                    actionLog.push(`      💀 ¡${targetPJ.name} ha caído!`);
                                     pjs_activos = combatants.filter(c => c.is_pj && c.current_pv > 0 && !c.status_effects.includes("derrotado")); // RECALCULAR PJs activos
                                }
                            } else { /* ... fallo ... */}
                        } else { actionLog.push(`   ${enemyCombatant.name} no encuentra objetivos.`);}

                  } else { actionLog.push(`   ${enemyCombatant.name} pierde turno (derrotado/aturdido).`); }

                  // Comprobar Fin Combate OTRA VEZ post-turno IA
                   if (pjs_activos.length === 0) { combatEnded = true; victory = false; break; } // Salir bucle IA si TPK

                   // Avanzar al siguiente combatiente en el bucle IA
                   nextTurnIndex = (nextTurnIndex + 1) % turnOrder.length;
                   combatState.combat_state_json.current_turn_index = nextTurnIndex;
                   if (nextTurnIndex === 0) { // Si la IA completa la ronda
                        combatState.combat_state_json.round_number++;
                       console.log(`   -> Iniciando Ronda ${combatState.combat_state_json.round_number} (post-IA)`);
                       actionLog.push(`*** Inicio Ronda ${combatState.combat_state_json.round_number} ***`);
                   }

              } // Fin While Turnos IA
        } // Fin if (!combatEnded post-PJ)


        // --- 7. RESOLVER FIN DE COMBATE / GUARDAR ESTADO ---
         // Añadir log final
          combatState.combat_state_json.combat_log.push(...actionLog);
          if(combatState.combat_state_json.combat_log.length > 50) combatState.combat_state_json.combat_log.slice(-50);


         let responseData = {};
         let updatedCharacter; // PJ actualizado a devolver

        if (combatEnded) {
             console.log(`[API] Combate finalizado. Victoria: ${victory}`);

             // Calcular XP Total Combate (Solo en victoria)
             let totalCombatXp = 0;
             if (victory) {
                 combatState.combat_state_json.combatants.forEach(c => {
                     if (!c.is_pj) {
                        // Buscar XP del bestiario incrustado o stats_snapshot
                         let xp = c.stats_snapshot?.xp_value || campaignData[currentCampaignId]?.[c.original_id]?.stats?.xp_value || 50; // XP por defecto
                        totalCombatXp += xp;
                     }
                 });
                console.log(`   -> XP Calculado por Victoria: ${totalCombatXp}`);
                 actionLog.push(`¡VICTORIA! Recompensa: +${totalCombatXp} XP.`);
              } else {
                  actionLog.push("¡DERROTA! La oscuridad os consume...");
              }

            // Determinar sección final
            const finalSectionId = victory ? combatState.combat_state_json.target_section_win : combatState.combat_state_json.target_section_loss;

            // Actualizar DB: PJ principal (XP, PV) y BORRAR registro combate
            // Necesitamos el estado del PJ que actuó para saber sus PV finales
             const actingPJState = combatants.find(c => c.original_id === characterId && c.is_pj);
             let finalHpChange = actingPJState ? (actingPJState.current_pv - (await db.getCharacter(characterId)).pv_current) : 0; // Diferencia PV para updateGameState (simplificado, idealmente updateGameState calcularía basado en estado final de combatants)

             // Limpiamos estado combate de la DB
             await combatConnection.execute('DELETE FROM `active_combats` WHERE `combat_id` = ?', [combatId]);
             console.log(`   -> Registro combate ${combatId} eliminado.`);

              // Guardamos sección final y XP/PV del PJ que actuó (idealmente TODOS los PJs del grupo)
             updatedCharacter = await db.updateGameState(
                characterId, currentCampaignId, finalSectionId,
                 {}, totalCombatXp, finalHpChange // Usa XP y HP calculados
             );
             if(!updatedCharacter) throw new Error("Fallo update DB post-combate.");

             // Obtener datos sección final
             const nextSection = getSectionFromData(currentCampaignId, finalSectionId);

             responseData = {
                 combatEnded: true, victory: victory,
                 finalLog: actionLog,
                 earnedXp: totalCombatXp, // XP ganado en este combate
                 nextSectionData: nextSection, // Sección post-combate
                 updatedCharacterStats: updatedCharacter // Estado final del PJ
             };

        } else {
            // Combate Continúa: Guardar estado actualizado y devolver
            combatState.combat_state_json.combatants = combatants; // Guardar PJs/Enemigos con PV/Estados actualizados
            combatState.combat_state_json.turn_order = turnOrder; // Por si acaso
             combatState.combat_state_json.current_turn_index = nextTurnIndex; // Guardar quién tiene el turno ahora

             await combatConnection.execute(
                  'UPDATE `active_combats` SET `combat_state_json` = ?, `updated_at` = NOW() WHERE `combat_id` = ?',
                  [JSON.stringify(combatState.combat_state_json), combatId]
             );
             console.log(`   -> Estado combate ${combatId} actualizado en DB (Turno: ${turnOrder[nextTurnIndex]}, Ronda: ${combatState.combat_state_json.round_number}).`);

            // Enviar el estado completo del combate y el log del turno
             responseData = {
                  combatEnded: false,
                  turnLog: actionLog, // Lo que pasó este turno
                  combatState: combatState.combat_state_json, // TODO el estado para que UI se actualice
                  // Enviar estado PARCIAL del PJ que actuó, o de TODOS los PJs para que UI actualice PVs, etc.
                  updatedCharacterStats: combatants.find(c => c.original_id === characterId && c.is_pj)
              };
        }

        // --- 9. COMMIT y RESPUESTA ---
        await combatConnection.commit(); // Confirma todos los cambios de la transacción (Update PJ, Delete Combate / Update Combate)
        console.log(`   -> Transacción Combate ${combatId} Confirmada.`);
        res.status(200).json(responseData);


    } catch (error) {
        if (combatConnection) await combatConnection.rollback();
        console.error("[API Error /combat/action]:", error);
        res.status(500).json({ error: error.message || "Error interno procesando acción combate." });
    } finally {
        if (combatConnection) combatConnection.release();
    }
});

// --- Iniciar Servidor ---
// ... (Código app.listen con db.testConnection() como antes) ...
const PORT = process.env.PORT || 3000;
db.testConnection().then(dbOk => {
    if (dbOk) { app.listen(PORT, () => console.log(`🚀 Server ready at http://localhost:${PORT}`)); }
    else { console.error("⛔ Server NOT started due to DB connection issues."); process.exit(1); }
}).catch(err => { console.error("💥 Unexpected error during DB test:", err); process.exit(1); });