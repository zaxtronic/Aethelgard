// database.js
// Módulo para gestionar la conexión y operaciones con la base de datos MySQL para Aethelgard

const mysql = require('mysql2/promise'); // Usa la versión con soporte para Promesas

// --- Configuración de la Conexión Local (XAMPP/MAMP/WAMP Típica) ---
//     ¡¡¡ ASEGÚRATE de que estos valores coincidan con tu configuración local !!!
const dbConfig = {
    host: 'localhost',          // Generalmente 'localhost' para instalaciones locales
    user: 'root',   // El usuario que CREASTE (o 'root')
    password: '', // La contraseña de ese usuario (o "" si 'root' no tiene contraseña)
    database: 'aethelgard_db',    // El nombre EXACTO de tu base de datos que creaste

    // Opciones del Pool (generalmente buenas por defecto)
    waitForConnections: true,       // Espera si todas las conexiones del pool están ocupadas
    connectionLimit: 10,           // Número máximo de conexiones en el pool
    queueLimit: 0,                 // Sin límite de consultas en cola esperando conexión
    connectTimeout: 10000          // Timeout para establecer conexión inicial (ms)
};
// --- === FIN DE LA CONFIGURACIÓN REQUERIDA === ---


// --- Creación del Pool de Conexiones ---
// Usar un pool es más eficiente que crear conexiones individuales para cada consulta.
let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log("⚪ Pool de conexiones MySQL (Local) inicializado.");
} catch (error) {
     console.error(" FATAL ERROR: No se pudo crear el pool de conexiones MySQL!", error.message);
     process.exit(1); // Detiene la aplicación si el pool no puede crearse
}


// --- Función para Probar la Conexión ---
// Intenta obtener una conexión del pool y liberarla. Útil al iniciar el servidor.
async function testConnection() {
    let connection = null; // Declarar fuera para asegurar que exista en finally
    try {
        console.log("[DB Test] Intentando obtener conexión del pool...");
        connection = await pool.getConnection();
        await connection.ping(); // Intenta un ping simple
        console.log("✅ Conexión a MySQL exitosa (Pool activo).");
        // Opcional: Realizar una consulta de prueba simple
        // const [rows] = await connection.execute('SELECT NOW() as time');
        // console.log(`   -> Prueba DB OK. Hora del servidor DB: ${rows[0].time}`);
        return true;
    } catch (error) {
        console.error("-----------------------------------------");
        console.error(" ERROR CRÍTICO: ¡No se pudo conectar a la base de datos MySQL!");
        console.error(" Detalles:", error.code || 'N/A', error.message); // Código y Mensaje del error MySQL
        console.error(" Sugerencias:");
        console.error("   - ¿Está corriendo MySQL (vía XAMPP Control Panel)?");
        console.error("   - ¿Son correctos host ('%s'), user ('%s'), password ('****') y database ('%s')?", dbConfig.host, dbConfig.user, dbConfig.database);
        console.error("   - ¿Existe la base de datos '%s'?", dbConfig.database);
        console.error("   - ¿Tiene el usuario '%s' permisos para conectar desde '%s' (localhost usualmente)?", dbConfig.user, dbConfig.host);
        console.error("-----------------------------------------");
        return false;
    } finally {
        if (connection) {
             connection.release(); // MUY IMPORTANTE: Siempre libera la conexión de vuelta al pool.
             // console.log("   -> Conexión de prueba devuelta al pool."); // Log opcional
         }
    }
}
function getEnemyBaseData(campaignId, enemyId) {
    try {
       // Navega por campaignData para encontrar el enemigo (simplificado)
        for (const sectionKey in campaignData[campaignId]) {
            const section = campaignData[campaignId][sectionKey];
            if (section.enemies) {
                const enemyDef = section.enemies.find(e => e.id === enemyId);
                if (enemyDef) {
                   // Devuelve una copia de los stats (o toda la definición si es necesario)
                    return JSON.parse(JSON.stringify(enemyDef.stats));
                }
            }
            // Podríamos necesitar buscar en un "bestiario" central si no está en la primera sección encontrada
        }
        console.warn(`[DB getEnemyBaseData] No se encontraron stats base para ${enemyId} en campaña ${campaignId}.`);
        return null; // O devolver stats por defecto
    } catch (e) {
         console.error(`[DB getEnemyBaseData] Error buscando datos para ${enemyId}:`, e);
        return null;
    }
}
/**
 * Crea una nueva instancia de combate en la base de datos.
 * @param {number} characterId ID del personaje principal involucrado.
 * @param {string} campaignId ID de la campaña.
 * @param {string} originSectionId ID de la sección donde empezó el combate.
 * @param {object} combatInfo Objeto con datos del combate (setup, targetSectionAfterCombat, enemies).
 * @param {number} playerCount Número de jugadores para escalar PVs.
 * @returns {Promise<object|null>} Objeto { combatId, initialState } o null en caso de error.
 */
async function createCombat(characterId, campaignId, originSectionId, combatInfo, playerCount = 2) {
    console.log(`[DB:createCombat] Creando instancia combate para Char ${characterId}, Camp ${campaignId}, Origin ${originSectionId}`);
    if (!characterId || !campaignId || !originSectionId || !combatInfo || !combatInfo.enemies || !combatInfo.targetSectionAfterCombat) {
        console.error("[DB:createCombat] Faltan datos necesarios.");
        return null;
    }

    let connection = null;
    try {
        connection = await pool.getConnection();

        // --- Preparar Datos Combatientes ---
        let combatants = [];
        let initiativeRolls = []; // Para ordenar después

        // 1. Añadir el Personaje Jugador Principal (y potencialmente otros PJs)
        //    TODO: Modificar para añadir TODOS los PJs del grupo si es multijugador
        const mainPJData = await getCharacter(characterId); // Obtener datos completos del PJ desde DB
        if (!mainPJData) throw new Error(`Personaje principal ${characterId} no encontrado al crear combate.`);

        const pjInitiative = rollD20() + getModifier(mainPJData.stat_dexterity);
        const pjTempId = `pj_${characterId}`;
        combatants.push({
            temp_id: pjTempId,
            original_id: characterId,
            name: mainPJData.name || "Aventurero",
            is_pj: true,
            initiative_roll: pjInitiative,
            current_pv: mainPJData.pv_current,
            max_pv: mainPJData.pv_max,
            ca: 10 + getModifier(mainPJData.stat_dexterity) + (mainPJData.inventory_json?.find(i=>i.equipped && i.item_id.includes('armor'))?.ac_bonus || 0) + (mainPJData.inventory_json?.find(i=>i.equipped && i.item_id.includes('shield'))?.ac_bonus || 0) , // Calcular CA base + armadura/escudo
            velocidad: 9, // Asumir velocidad base (o leerla si la guardas en characters)
            position: null, // Iniciar sin posición definida
            status_effects: [],
            stats_snapshot: { // Guarda datos clave del PJ
                 fue_mod: getModifier(mainPJData.stat_strength),
                 des_mod: getModifier(mainPJData.stat_dexterity),
                 con_mod: getModifier(mainPJData.stat_constitution),
                 int_mod: getModifier(mainPJData.stat_intelligence),
                 sab_mod: getModifier(mainPJData.stat_wisdom),
                 car_mod: getModifier(mainPJData.stat_charisma),
                  // Simplificado, asume ataque con arma principal o hechizo base
                  // En real, se necesitaría saber qué tiene equipado/preparado
                 ataque_principal_bono: "+" + (getModifier(mainPJData.stat_strength) + (mainPJData.level > 0 ? 2 : 1)), // Asume FUE y competencia (+2 desde N1?)
                 ataque_principal_dano: "1d8+" + getModifier(mainPJData.stat_strength) // Ejemplo espada larga
            }
        });
        initiativeRolls.push({ id: pjTempId, roll: pjInitiative });

        // 2. Añadir Enemigos (resolviendo counts y escalando PV)
        let enemyCounter = {}; // Para numerar enemigos del mismo tipo (lobo_1, lobo_2)
        for (const enemyGroup of combatInfo.enemies) {
            const enemyBaseStats = getEnemyBaseData(campaignId, enemyGroup.id); // Obtener stats del "bestiario" JSON
            if (!enemyBaseStats) { console.warn(`   -> Stats para ${enemyGroup.id} no encontrados, saltando.`); continue; }

            // Resolver número de enemigos
            let count = 1;
            if (enemyGroup.count?.includes('d')) { count = rollDamage(enemyGroup.count); }
            else { count = parseInt(enemyGroup.count || '1', 10); }
             count = Math.max(1, count); // Asegurar al menos 1

             console.log(`   -> Añadiendo ${count} x ${enemyGroup.name}...`);

             for (let i = 0; i < count; i++) {
                enemyCounter[enemyGroup.id] = (enemyCounter[enemyGroup.id] || 0) + 1;
                const enemyTempId = `enemy_${enemyGroup.id}_${enemyCounter[enemyGroup.id]}`;

                // Escalar PV Base
                 let basePV = enemyBaseStats.pv_base || 10;
                 let scaledPV = basePV;
                 if (playerCount === 3) scaledPV = Math.ceil(basePV * 1.25);
                 else if (playerCount === 4) scaledPV = Math.ceil(basePV * 1.5);
                  // else if (playerCount === 1) scaledPV = Math.ceil(basePV * 0.75);

                 // Calcular iniciativa enemigo
                 const enemyInitiative = rollD20() + (getModifier(enemyBaseStats.caracteristicas?.des) || 0);

                 combatants.push({
                     temp_id: enemyTempId,
                     original_id: enemyGroup.id,
                     name: `${enemyGroup.name} #${enemyCounter[enemyGroup.id]}`,
                     is_pj: false,
                     initiative_roll: enemyInitiative,
                     current_pv: scaledPV, // PV Escalaados
                     max_pv: scaledPV,    // PV Escalaados
                     ca: enemyBaseStats.ca || 10,
                     velocidad: enemyBaseStats.velocidad || 9,
                     position: null,
                     status_effects: [],
                      stats_snapshot: { // Copiar datos esenciales para combate
                          ca_base: enemyBaseStats.ca || 10,
                           ataques: enemyBaseStats.ataques || [],
                           habilidades_especiales: enemyBaseStats.habilidades_especiales || [],
                           resistencias_dano: enemyBaseStats.resistencias_dano || [],
                           inmunidades_dano: enemyBaseStats.inmunidades_dano || [],
                           vulnerabilidades_dano: enemyBaseStats.vulnerabilidades_dano || [],
                           inmunidades_condicion: enemyBaseStats.inmunidades_condicion || [],
                            // Podríamos añadir mods si IA los necesita explícitamente
                           fue_mod: getModifier(enemyBaseStats.caracteristicas?.fue),
                           des_mod: getModifier(enemyBaseStats.caracteristicas?.des),
                           xp_value: enemyBaseStats.xp_value || 50 // Guardar XP para después
                       },
                       ia_hints: enemyBaseStats.ia_basica || {}
                  });
                 initiativeRolls.push({ id: enemyTempId, roll: enemyInitiative });
            }
        }

        // 3. Ordenar por Iniciativa (mayor a menor, desempate DES)
        initiativeRolls.sort((a, b) => {
             if (b.roll !== a.roll) return b.roll - a.roll; // Mayor tirada primero
            // Desempate: Usa Mod DES (del combatant)
             const combatantA = combatants.find(c=>c.temp_id === a.id);
             const combatantB = combatants.find(c=>c.temp_id === b.id);
             const desA = combatantA?.is_pj ? getModifier(mainPJData.stat_dexterity) : (combatantA?.stats_snapshot?.des_mod || 0);
             const desB = combatantB?.is_pj ? getModifier(mainPJData.stat_dexterity) : (combatantB?.stats_snapshot?.des_mod || 0);
            return desB - desA; // Mayor DES primero en empate
        });
        const finalTurnOrder = initiativeRolls.map(item => item.id);
        console.log("   -> Orden Iniciativa:", finalTurnOrder.join(', '));

        // 4. Construir el Estado JSON Inicial
        const initialStateJSON = {
            combat_instance_id: null, // La DB asignará el ID real
            campaign_id: campaignId,
            section_origin_id: originSectionId,
            target_section_win: combatInfo.targetSectionAfterCombat,
            target_section_loss: "tpk_ending", // Asumir nodo de derrota
            round_number: 1,
            current_turn_index: 0, // Empieza el primero de la lista
            combat_log: [`Inicio Combate (Ronda 1, Turno: ${combatants.find(c=>c.temp_id === finalTurnOrder[0])?.name || '???'})`],
            turn_order: finalTurnOrder,
            combatants: combatants // Array con todos los PJs/Enemigos y sus datos iniciales
        };

        // 5. Insertar en la Base de Datos
        const sqlInsertCombat = 'INSERT INTO `active_combats` (character_id, campaign_id, section_id_origin, target_section_after_combat, combat_state_json) VALUES (?, ?, ?, ?, ?)';
        const [insertResult] = await connection.execute(sqlInsertCombat, [
            characterId,
            campaignId,
            originSectionId,
            combatInfo.targetSectionAfterCombat,
            JSON.stringify(initialStateJSON) // Guardar el objeto como string JSON
        ]);

        if (!insertResult.insertId) {
             throw new Error("Fallo al insertar combate en la base de datos.");
         }
        const newCombatId = insertResult.insertId;
         initialStateJSON.combat_instance_id = newCombatId; // Añadir el ID real al estado

        // 6. Confirmar Transacción (crear combate es una sola acción, podríamos hacer commit aquí)
         // O dejar que la ruta API que llama haga el commit general
         // await connection.commit();

        console.log(`[DB:createCombat] Combate ${newCombatId} creado con éxito.`);
        return { combatId: newCombatId, initialState: initialStateJSON }; // Devolver ID y estado inicial

    } catch (error) {
        if (connection) await connection.rollback(); // Revertir si algo falló durante la creación
        console.error(`[DB:createCombat] Error creando instancia combate para Char ${characterId}:`, error);
        // Es importante saber por qué falló
         throw new Error(`Error DB al crear combate: ${error.message}`);
    } finally {
        if (connection) connection.release(); // Liberar la conexión
    }
}

/**
 * Elimina un registro de combate activo de la base de datos.
 * @param {number} combatId ID del combate a eliminar.
 * @returns {Promise<boolean>} True si se eliminó, false si no se encontró o hubo error.
 */
async function deleteCombat(combatId) {
    if (!combatId) {
        console.warn("[DB:deleteCombat] Se necesita combatId.");
        return false;
    }
    console.log(`[DB:deleteCombat] Eliminando registro combate ID: ${combatId}`);
    const sql = 'DELETE FROM `active_combats` WHERE `combat_id` = ?';
    try {
        const [result] = await pool.execute(sql, [combatId]);
        if (result.affectedRows > 0) {
            console.log(`   -> Combate ${combatId} eliminado correctamente.`);
            return true;
        } else {
            console.warn(`   -> Combate ${combatId} no encontrado para eliminar.`);
            return false;
        }
    } catch (error) {
        console.error(`[DB:deleteCombat] Error SQL eliminando combate ${combatId}:`, error);
        return false;
    }
}

// --- Exportar ---
module.exports = {
    pool, testConnection, getCharacter, getGameState, updateGameState,
    createCombat, // <-- Nueva función
    deleteCombat  // <-- Nueva función
    // Idealmente: getCombatStateById, updateCombatStateJSON
};

// --- Función para Parsear JSON de forma segura ---
// Evita que el servidor falle si un campo JSON está malformado o es nulo en la DB.
function safeJsonParse(jsonString, defaultVal = null) {
    if (typeof jsonString !== 'string' || !jsonString) return defaultVal; // Devuelve default si no es string válido
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.warn("[DB safeJsonParse] Error al parsear JSON:", e.message, "- Cadena recibida:", jsonString, "- Devolviendo:", defaultVal);
        return defaultVal;
    }
}

// --- Función para Obtener Datos Completos de un Personaje ---
// Recibe el ID del personaje y devuelve el objeto del personaje completo o null si no existe/error.
async function getCharacter(characterId) {
    if (!characterId) {
        console.warn("[DB:getCharacter] Se recibió un characterId inválido.");
        return null;
    }
    console.log(`[DB:getCharacter] Buscando personaje ID: ${characterId}`);
    // Usamos backticks (`) para nombres de tablas/columnas por seguridad y compatibilidad
    const sql = 'SELECT * FROM `characters` WHERE `character_id` = ? LIMIT 1';
    try {
        // pool.execute es más seguro contra inyección SQL que pool.query para datos variables
        const [rows] = await pool.execute(sql, [characterId]);
        if (rows.length === 0) {
            console.log(`[DB:getCharacter] Personaje ${characterId} no encontrado.`);
            return null;
        }

        // Parsear campos JSON antes de devolver
        const character = rows[0];
        console.log(`[DB:getCharacter] Personaje ${characterId} encontrado. Parseando datos JSON...`);
        // Usar safeJsonParse con valores por defecto apropiados
        character.inventory_json = safeJsonParse(character.inventory_json, []);
        character.abilities_json = safeJsonParse(character.abilities_json, []);
        character.spells_known_json = safeJsonParse(character.spells_known_json, {});
        character.spells_prepared_json = safeJsonParse(character.spells_prepared_json, []);

        console.log(`[DB:getCharacter] Datos completos personaje ${characterId} listos.`);
        return character;
    } catch (error) {
        console.error(`[DB:getCharacter] Error SQL obteniendo personaje ${characterId}:`, error);
        // Podríamos decidir devolver null en lugar de lanzar para simplificar manejo en API
        // throw new Error(`Error DB buscando personaje ${characterId}.`);
        return null;
    }
}

// --- Función para Obtener el Estado del Juego de un Personaje ---
// Recibe ID de personaje, devuelve objeto game_state (con flags parseados) o null.
async function getGameState(characterId) {
    if (!characterId) {
        console.warn("[DB:getGameState] ID de personaje inválido.");
        return null;
    }
    console.log(`[DB:getGameState] Buscando estado para personaje ID: ${characterId}`);
    const sql = 'SELECT * FROM `game_state` WHERE `character_id` = ? LIMIT 1';
    try {
        const [rows] = await pool.execute(sql, [characterId]);
        if (rows.length === 0) {
            console.log(`[DB:getGameState] No hay estado guardado para ${characterId}.`);
            return null;
        }

        // Parsear JSON de flags
        const gameState = rows[0];
        console.log(`[DB:getGameState] Estado encontrado para ${characterId}. Parseando flags JSON...`);
        gameState.campaign_flags_json = safeJsonParse(gameState.campaign_flags_json, {}); // Default a objeto vacío si falla/null

        console.log(`[DB:getGameState] Estado para ${characterId} listo (Sección: ${gameState.current_section_id}).`);
        return gameState;
    } catch (error) {
        console.error(`[DB:getGameState] Error SQL obteniendo estado para ${characterId}:`, error);
        return null;
    }
}


// --- Función para Actualizar Estado (Transaccional) ---
// Centraliza la lógica de guardar el progreso del juego y los cambios en el personaje.
// Devuelve el objeto COMPLETO y ACTUALIZADO del personaje (con su gameState adjunto) o lanza error.
async function updateGameState(characterId, campaignId, newSectionId, flagsToSet = {}, earnedXp = 0, hpChange = 0 /*, itemsGained = [], itemsLost = []*/) {
    // Validar Inputs esenciales
    if (!characterId || !campaignId || !newSectionId) {
        console.error("[DB:update] Datos insuficientes (charId, campId, newSectId requeridos).");
        throw new Error("Datos insuficientes para actualizar estado del juego.");
    }
    // Validar que los cambios numéricos sean números
    earnedXp = parseInt(earnedXp, 10) || 0;
    hpChange = parseInt(hpChange, 10) || 0;
    // Asegurar que flagsToSet sea un objeto
    flagsToSet = (typeof flagsToSet === 'object' && flagsToSet !== null) ? flagsToSet : {};


    let connection = null; // La conexión se manejará dentro del try/finally
    console.log(`[DB:update] Iniciando Tx para Char ${characterId} -> Camp ${campaignId}, Sect ${newSectionId}, XP+${earnedXp}, HP±${hpChange}, Flags:`, flagsToSet);

    try {
        connection = await pool.getConnection(); // Obtener conexión del pool
        await connection.beginTransaction(); // Iniciar Transacción

        // --- 1. OBTENER y BLOQUEAR filas para actualizar ---
        let currentFlags = {};
        let currentCharData = null;

        // Obtener/Bloquear game_state
        const sqlGetState = 'SELECT campaign_flags_json FROM `game_state` WHERE `character_id` = ? FOR UPDATE';
        const [stateRows] = await connection.execute(sqlGetState, [characterId]);
        if (stateRows.length > 0) {
            currentFlags = safeJsonParse(stateRows[0].campaign_flags_json, {}); // Parsea flags actuales o default vacío
        }

        // Obtener/Bloquear personaje
        const sqlGetChar = 'SELECT level, xp, pv_current, pv_max FROM `characters` WHERE `character_id` = ? FOR UPDATE';
        const [charRows] = await connection.execute(sqlGetChar, [characterId]);
        if (charRows.length === 0) {
            // ¡IMPORTANTE! Si el personaje no existe, la transacción debe fallar.
            throw new Error(`[DB:update] Personaje ${characterId} no encontrado en DB durante Tx.`);
        }
        currentCharData = charRows[0];

        // --- 2. CALCULAR Nuevos Valores ---
        const mergedFlagsObject = { ...currentFlags, ...flagsToSet }; // Fusiona flags (nuevos sobreescriben)
        const mergedFlags = JSON.stringify(mergedFlagsObject);       // Convertir a JSON para guardar
        const newXp = (currentCharData.xp || 0) + earnedXp;
        let newPv = (currentCharData.pv_current || 0) + hpChange;
        // Clamp PV entre 0 y Máximo actual
        newPv = Math.max(0, Math.min(newPv, currentCharData.pv_max || 0));
        // TODO: Calcular lógica de subida de nivel y actualizar newLevel / pv_max si aplica
        let newLevel = currentCharData.level || 1;

        // --- 3. EJECUTAR UPDATES/INSERTS dentro de la Tx ---
        // Actualizar o Insertar Estado del Juego
        const stateSql = `
            INSERT INTO game_state (character_id, campaign_id, current_section_id, campaign_flags_json, last_saved_at)
            VALUES (?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                campaign_id = VALUES(campaign_id), current_section_id = VALUES(current_section_id),
                campaign_flags_json = VALUES(campaign_flags_json), last_saved_at = NOW()`;
        const [stateResult] = await connection.execute(stateSql, [characterId, campaignId, newSectionId, mergedFlags]);
        console.log(`   -> Estado Juego DB (Char ${characterId}): Rows Affected=${stateResult.affectedRows}, InsertId=${stateResult.insertId}`);

        // Actualizar Personaje
        // TODO: Incluir level = ? y pv_max = ? si implementas subida de nivel
        const charSql = 'UPDATE `characters` SET `xp` = ?, `pv_current` = ? /*, `level` = ? */ WHERE character_id = ?';
        const [charResult] = await connection.execute(charSql, [newXp, newPv, /* newLevel, */ characterId]);
        console.log(`   -> Personaje DB (Char ${characterId}): Rows Affected=${charResult.affectedRows}`);
        if (charResult.affectedRows === 0) {
             // Fila no encontrada O valores eran iguales (no hubo cambio real)
             // Podría ser un error si esperábamos sí o sí una actualización.
             console.warn(`[DB:update] WARNING: No se actualizaron filas para personaje ${characterId}.`);
             // Podríamos lanzar error si affectedRows es crítico para el flujo.
             // throw new Error(`No se actualizó personaje ${characterId}.`);
         }

        // --- 4. Lógica Inventario (PENDIENTE) ---
        //      Aquí ejecutarías INSERTs/DELETEs/UPDATEs para los items en las tablas
        //      de inventario (o actualizar el inventory_json si usas ese enfoque)
        //      basado en itemsGained/itemsLost pasados como argumento.
        //      await connection.execute('INSERT INTO inventory...', [...itemsGained]);
        //      await connection.execute('DELETE FROM inventory WHERE ...', [...itemsLost]);

        // --- 5. COMMIT: Confirmar todos los cambios ---
        await connection.commit();
        console.log(`   -> Transacción para Char ${characterId} confirmada.`);

        // --- 6. Devolver Estado Completo y Actualizado ---
        // Es más fiable obtener los datos frescos de la DB después del commit.
        const finalUpdatedCharacter = await getCharacter(characterId); // Reutiliza la función que ya parsea JSONs
        if (!finalUpdatedCharacter) {
            // Esto sería muy raro si los updates funcionaron, pero es un check final
             throw new Error(`No se pudo recuperar el personaje ${characterId} actualizado post-commit.`);
        }
        // Adjuntamos también el estado del juego recién guardado/actualizado
        finalUpdatedCharacter.gameState = await getGameState(characterId);

        return finalUpdatedCharacter; // Devuelve el objeto PJ completo + gameState

    } catch (error) {
        // Si CUALQUIER paso dentro del 'try' falla, revertir la transacción
        if (connection) {
            console.error(`[DB:update] ¡¡ERROR!! Reverting transacción para Char ${characterId}.`);
            await connection.rollback(); // Deshace todos los cambios de la transacción
        }
        console.error(`[DB:update] Error SQL/Lógica actualizando estado para Char ${characterId}:`, error);
        // Relanzar el error para que la capa superior (API) lo maneje
        throw new Error(`Error de base de datos al actualizar estado del juego.`);
    } finally {
        // MUY IMPORTANTE: Liberar la conexión de vuelta al pool, incluso si hubo error
        if (connection) {
             connection.release();
             console.log(`   -> Conexión devuelta al pool (post Tx/Error para Char ${characterId}).`);
         }
    }
}


// --- Exportar las funciones necesarias y el pool ---
module.exports = {
    pool,               // Exportar por si se necesita acceso directo al pool
    testConnection,     // Para pruebas iniciales
    getCharacter,       // Obtiene datos PJ
    getGameState,       // Obtiene estado específico del juego
    updateGameState     // Función transaccional principal para guardar progreso
    // Añade aquí otras funciones DB que puedas necesitar (ej: createCharacter, etc.)
};