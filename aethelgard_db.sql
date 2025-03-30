-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 29-03-2025 a las 00:00:52
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `aethelgard_db`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `active_combats`
--

CREATE TABLE `active_combats` (
  `combat_id` int(11) NOT NULL COMMENT 'ID único del combate activo',
  `character_id` int(11) NOT NULL COMMENT 'ID del personaje principal o representante del grupo en este combate (FK a characters)',
  `campaign_id` varchar(100) NOT NULL COMMENT 'ID de la campaña actual (ej: minas_corruptas)',
  `section_id_origin` varchar(50) NOT NULL COMMENT 'ID de la sección donde se inició el combate',
  `target_section_after_combat` varchar(50) NOT NULL COMMENT 'ID de la sección a la que ir si los PJs ganan',
  `combat_state_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Objeto JSON con TODO el estado detallado del combate (ver estructura abajo)' CHECK (json_valid(`combat_state_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Cuándo se inició el combate',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Última vez que se actualizó el estado del combate'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Almacena el estado detallado de los combates activos';

--
-- Volcado de datos para la tabla `active_combats`
--

INSERT INTO `active_combats` (`combat_id`, `character_id`, `campaign_id`, `section_id_origin`, `target_section_after_combat`, `combat_state_json`, `created_at`, `updated_at`) VALUES
(1, 1, 'minas_corruptas', '16', '17', '{\"combat_instance_id\":null,\"campaign_id\":\"minas_corruptas\",\"section_origin_id\":\"16\",\"target_section_win\":\"17\",\"target_section_loss\":\"tpk_ending\",\"round_number\":1,\"current_turn_index\":0,\"combat_log\":[\"Inicio Combate (Ronda 1, Turno: Borin Manopetra)\"],\"turn_order\":[\"pj_1\"],\"combatants\":[{\"temp_id\":\"pj_1\",\"original_id\":1,\"name\":\"Borin Manopetra\",\"is_pj\":true,\"initiative_roll\":20,\"current_pv\":26,\"max_pv\":26,\"ca\":11,\"velocidad\":9,\"position\":null,\"status_effects\":[],\"stats_snapshot\":{\"fue_mod\":3,\"des_mod\":1,\"con_mod\":2,\"int_mod\":0,\"sab_mod\":0,\"car_mod\":-1,\"ataque_principal_bono\":\"+5\",\"ataque_principal_dano\":\"1d8+3\"}}]}', '2025-03-28 22:48:38', '2025-03-28 22:48:38'),
(2, 2, 'minas_corruptas', '13', '16', '{\"combat_instance_id\":null,\"campaign_id\":\"minas_corruptas\",\"section_origin_id\":\"13\",\"target_section_win\":\"16\",\"target_section_loss\":\"tpk_ending\",\"round_number\":1,\"current_turn_index\":0,\"combat_log\":[\"Inicio Combate (Ronda 1, Turno: Elara Umbrío)\"],\"turn_order\":[\"pj_2\"],\"combatants\":[{\"temp_id\":\"pj_2\",\"original_id\":2,\"name\":\"Elara Umbrío\",\"is_pj\":true,\"initiative_roll\":6,\"current_pv\":17,\"max_pv\":17,\"ca\":13,\"velocidad\":9,\"position\":null,\"status_effects\":[],\"stats_snapshot\":{\"fue_mod\":-1,\"des_mod\":3,\"con_mod\":-1,\"int_mod\":2,\"sab_mod\":0,\"car_mod\":1,\"ataque_principal_bono\":\"+1\",\"ataque_principal_dano\":\"1d8+-1\"}}]}', '2025-03-28 22:49:55', '2025-03-28 22:49:55'),
(3, 3, 'minas_corruptas', '13', '16', '{\"combat_instance_id\":null,\"campaign_id\":\"minas_corruptas\",\"section_origin_id\":\"13\",\"target_section_win\":\"16\",\"target_section_loss\":\"tpk_ending\",\"round_number\":1,\"current_turn_index\":0,\"combat_log\":[\"Inicio Combate (Ronda 1, Turno: Finnian Piesligeros)\"],\"turn_order\":[\"pj_3\"],\"combatants\":[{\"temp_id\":\"pj_3\",\"original_id\":3,\"name\":\"Finnian Piesligeros\",\"is_pj\":true,\"initiative_roll\":8,\"current_pv\":20,\"max_pv\":20,\"ca\":12,\"velocidad\":9,\"position\":null,\"status_effects\":[],\"stats_snapshot\":{\"fue_mod\":0,\"des_mod\":2,\"con_mod\":2,\"int_mod\":-1,\"sab_mod\":2,\"car_mod\":0,\"ataque_principal_bono\":\"+2\",\"ataque_principal_dano\":\"1d8+0\"}}]}', '2025-03-28 22:53:21', '2025-03-28 22:53:21');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `characters`
--

CREATE TABLE `characters` (
  `character_id` int(11) NOT NULL COMMENT 'Identificador único del personaje',
  `user_id` int(11) DEFAULT NULL COMMENT 'ID del usuario propietario (FK a users, NULL si no hay login)',
  `name` varchar(100) NOT NULL COMMENT 'Nombre del personaje',
  `race` varchar(50) NOT NULL COMMENT 'Raza principal (Humano, Elfo, Orco, Enano)',
  `subrace` varchar(50) NOT NULL COMMENT 'Subraza específica',
  `class` varchar(50) NOT NULL COMMENT 'Clase principal del personaje',
  `level` int(11) NOT NULL DEFAULT 1 COMMENT 'Nivel actual del personaje',
  `xp` int(11) NOT NULL DEFAULT 0 COMMENT 'Puntos de experiencia acumulados',
  `stat_strength` int(11) NOT NULL DEFAULT 10 COMMENT 'Puntuación de Fuerza',
  `stat_dexterity` int(11) NOT NULL DEFAULT 10 COMMENT 'Puntuación de Destreza',
  `stat_constitution` int(11) NOT NULL DEFAULT 10 COMMENT 'Puntuación de Constitución',
  `stat_intelligence` int(11) NOT NULL DEFAULT 10 COMMENT 'Puntuación de Inteligencia',
  `stat_wisdom` int(11) NOT NULL DEFAULT 10 COMMENT 'Puntuación de Sabiduría',
  `stat_charisma` int(11) NOT NULL DEFAULT 10 COMMENT 'Puntuación de Carisma',
  `pv_max` int(11) NOT NULL DEFAULT 10 COMMENT 'Puntos de Vida Máximos (Calculados por nivel/CON)',
  `pv_current` int(11) NOT NULL DEFAULT 10 COMMENT 'Puntos de Vida Actuales',
  `money_gold` int(11) NOT NULL DEFAULT 15 COMMENT 'Dinero inicial/actual (Monedas de Oro)',
  `inventory_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array de objetos representando el inventario. Ej: [{"item_id":"torch", "qty":2}]' CHECK (json_valid(`inventory_json`)),
  `abilities_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array de strings o objetos con habilidades/dotes. Ej: ["Ataque Poderoso"]' CHECK (json_valid(`abilities_json`)),
  `spells_known_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Objeto/Array para hechizos conocidos (Bardo/Hechicero). Ej: {"0": ["luz"], "1": ["escudo"]}' CHECK (json_valid(`spells_known_json`)),
  `spells_prepared_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array de IDs/nombres hechizos preparados (Clérigo/Chamán). Ej: ["curar_heridas_l1"]' CHECK (json_valid(`spells_prepared_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Fecha y hora de creación del personaje',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Fecha y hora de la última actualización'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Almacena todos los datos de los personajes jugadores';

--
-- Volcado de datos para la tabla `characters`
--

INSERT INTO `characters` (`character_id`, `user_id`, `name`, `race`, `subrace`, `class`, `level`, `xp`, `stat_strength`, `stat_dexterity`, `stat_constitution`, `stat_intelligence`, `stat_wisdom`, `stat_charisma`, `pv_max`, `pv_current`, `money_gold`, `inventory_json`, `abilities_json`, `spells_known_json`, `spells_prepared_json`, `created_at`, `updated_at`) VALUES
(1, NULL, 'Borin Manopetra', 'Enano', 'Montañas', 'Guerrero', 1, 575, 17, 13, 14, 10, 10, 8, 26, 26, 15, '[\"Item Martillo Guerra\",\"Item Armadura Malla\",\"Item Escudo\",\"Ración x5\"]', '[\"Ataque Poderoso\",\"Estilo Combate: Defensa\"]', NULL, NULL, '2025-03-26 21:37:47', '2025-03-28 22:39:42'),
(2, NULL, 'Elara Umbrío', 'Elfo', 'Oscuro', 'Pícaro', 1, 450, 8, 17, 8, 14, 10, 12, 17, 17, 25, '[\"Daga x2\",\"Armadura Cuero Ligero\",\"Herramientas Ladrón\",\"Cuerda (15m)\",\"Ración x3\"]', '[\"Ataque Furtivo\",\"Pericia: Sigilo\",\"Pericia: Juego Manos\"]', NULL, NULL, '2025-03-26 21:37:47', '2025-03-28 22:38:25'),
(3, NULL, 'Finnian Piesligeros', 'Humano', 'Fronterizo', 'Explorador', 1, 225, 10, 15, 14, 8, 14, 10, 20, 20, 10, '[\"Arco Largo\",\"Flechas x20\",\"Espada Corta\",\"Armadura Cuero\",\"Trampa Caza x2\",\"Ración x7\"]', '[\"Explorador Innato: Bestias, Bosque\",\"Estilo Combate: Arquería\"]', '{\"cantrips\": [\"orientación\"], \"level1\": [\"marca_cazador\", \"curar_heridas\"]}', NULL, '2025-03-26 21:37:47', '2025-03-28 22:53:19'),
(4, NULL, 'Seraphina MelodíaTriste', 'Elfo', 'Alto', 'Bardo', 1, 0, 8, 14, 10, 14, 10, 17, 18, 18, 30, '[\"Ropera\",\"Daga\",\"Laúd Élfico\",\"Ropajes Viajero Elegantes\",\"Tinta y Pluma\",\"Pergamino x5\"]', '[\"Inspiración Barda (d6)\",\"Aprendiz de Mucho\"]', '{\"cantrips\": [\"luz\", \"burla_cruel\"], \"level1\": [\"curar_heridas\", \"detectar_magia\", \"dormir\", \"hechizar_persona\"]}', NULL, '2025-03-26 21:37:47', '2025-03-26 21:37:47'),
(5, NULL, 'Marius Scintilla', 'Humano', 'Erudito', 'Hechicero', 1, 0, 9, 12, 14, 16, 10, 14, 17, 17, 15, '[\"Bastón Arcano\",\"Libro Hechizos\",\"Componentes (Bolsa)\",\"Daga\",\"Ropajes Erudito\"]', '[\"Origen: Magia Salvaje\"]', '{\"cantrips\": [\"mano_mago\", \"luz\", \"rociada_venenosa\", \"toque_gélido\"], \"level1\": [\"escudo\", \"proyectil_mágico\"]}', NULL, '2025-03-26 21:37:47', '2025-03-26 21:37:47'),
(6, NULL, 'Hermana Kaelen', 'Humano', 'Urbano', 'Clérigo', 1, 0, 10, 10, 14, 12, 16, 14, 17, 17, 20, '[\"Maza Ligera\",\"Escudo\",\"Símbolo Sagrado\",\"Armadura Escamas\",\"Kit Sanador\",\"Agua Bendita x1\"]', '[\"Dominio: Vida\",\"Canalizar Divinidad\",\"Discípulo Vida\"]', NULL, '[\"luz_sagrada\", \"orientación\", \"resistencia\", \"bendecir_l1\", \"curar_heridas_l1\", \"escudo_de_fe_l1\"]', '2025-03-26 21:37:47', '2025-03-26 21:37:47'),
(7, NULL, 'Grosh Espíritu Roto', 'Orco', 'Negro', 'Chamán', 1, 0, 14, 8, 17, 8, 16, 8, 25, 25, 5, '[\"Gran Hacha (Tótem?)\",\"Pieles Gruesas\",\"Hierbas Med.\",\"Fetiches Hueso\"]', '[\"Vínculo Espiritual: Lobo\", \"Tótem Espiritual\"]', NULL, '[\"espina_latigo\", \"orientación\", \"resistencia\", \"curar_heridas_l1\", \"niebla_obscurecedora_l1\", \"onda_atronadora_l1\"]', '2025-03-26 21:37:47', '2025-03-26 21:37:47'),
(8, NULL, 'Brynja Acechante Silenciosa', 'Elfo', 'Silvano', 'Cazador', 1, 0, 12, 16, 13, 10, 15, 8, 22, 22, 15, '[\"Arco Largo\",\"Flechas x20\",\"Cimitarra x2\",\"Armadura Cuero\",\"Trampa Caza x2\"]', '[\"Rastreador Nato\", \"Presa Marcada\", \"Estilo Combate: Arquería\"]', NULL, NULL, '2025-03-26 21:37:47', '2025-03-26 21:37:47'),
(9, NULL, 'Durgar Puñoferreo', 'Enano', 'Colinas', 'Guerrero', 1, 0, 15, 10, 16, 8, 13, 9, 28, 28, 15, '[\"Hacha Batalla\",\"Escudo Pesado\",\"Armadura Tiras\",\"Martillo Arrojadizo x2\"]', '[\"Ataque Poderoso\", \"Estilo Combate: Defensa\"]', NULL, NULL, '2025-03-26 21:37:47', '2025-03-26 21:37:47'),
(10, NULL, 'Silas \'Sombra\' Nocturno', 'Humano', 'Urbano', 'Pícaro', 1, 0, 8, 15, 10, 13, 9, 16, 18, 18, 30, '[\"Espada Corta\",\"Daga x3\",\"Arm. Cuero Buena\",\"Kit Disfraces\",\"Barreta\"]', '[\"Ataque Furtivo\", \"Pericia: Engaño\", \"Pericia: Persuasión\"]', NULL, NULL, '2025-03-26 21:37:47', '2025-03-26 21:37:47'),
(11, NULL, 'Vorlag ColmilloNegro', 'Orco', 'Montaña', 'Cazador', 1, 0, 17, 14, 14, 8, 13, 7, 24, 24, 10, '[\"Gran Hacha\",\"Jabalina x4\",\"Arm. Pieles\",\"Trampa Caza Grande x1\"]', '[\"Rastreador Nato\", \"Presa Marcada\", \"Estilo Combate: Armas a Dos Manos\"]', NULL, NULL, '2025-03-26 21:37:47', '2025-03-26 21:37:47'),
(12, NULL, 'Faelar Velo Lunar', 'Elfo', 'Alto', 'Hechicero', 1, 0, 8, 13, 9, 17, 10, 14, 14, 14, 15, '[\"Bastón Punta Cristal\",\"Libro Conjuros\",\"Daga Plateada\",\"Túnicas Viaje Finas\"]', '[\"Origen: Saber Arcano?\"]', '{\"cantrips\": [\"luz\", \"mano_mago\", \"mensaje\", \"prestidigitación\"], \"level1\": [\"niebla_mental\", \"dormir\"]}', NULL, '2025-03-26 21:37:47', '2025-03-26 21:37:47');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `game_state`
--

CREATE TABLE `game_state` (
  `game_state_id` int(11) NOT NULL COMMENT 'ID único del estado guardado',
  `character_id` int(11) NOT NULL COMMENT 'ID del personaje asociado a este estado (FK a characters)',
  `campaign_id` varchar(100) NOT NULL COMMENT 'Identificador de la campaña jugada (ej: minas_corruptas)',
  `current_section_id` varchar(50) NOT NULL COMMENT 'ID de la última sección alcanzada por el jugador',
  `campaign_flags_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Objeto JSON para guardar flags/decisiones de esta partida específica. Ej: {"elara_met":true}' CHECK (json_valid(`campaign_flags_json`)),
  `last_saved_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Fecha y hora del último guardado/actualización'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Guarda el progreso actual de un personaje en una campaña';

--
-- Volcado de datos para la tabla `game_state`
--

INSERT INTO `game_state` (`game_state_id`, `character_id`, `campaign_id`, `current_section_id`, `campaign_flags_json`, `last_saved_at`) VALUES
(1, 1, 'minas_corruptas', 'combat:1', '{}', '2025-03-28 22:48:38'),
(2, 2, 'minas_corruptas', 'combat:2', '{}', '2025-03-28 22:49:55'),
(30, 3, 'minas_corruptas', 'combat:3', '{}', '2025-03-28 22:53:21');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL COMMENT 'Identificador único del usuario',
  `username` varchar(50) NOT NULL COMMENT 'Nombre de usuario para login',
  `password_hash` varchar(255) NOT NULL COMMENT 'Hash seguro de la contraseña (NUNCA texto plano)',
  `email` varchar(100) DEFAULT NULL COMMENT 'Email del usuario (opcional, puede ser NULL)',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Fecha y hora de creación del usuario'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Almacena información de los jugadores registrados';

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `active_combats`
--
ALTER TABLE `active_combats`
  ADD PRIMARY KEY (`combat_id`),
  ADD KEY `idx_combat_character` (`character_id`);

--
-- Indices de la tabla `characters`
--
ALTER TABLE `characters`
  ADD PRIMARY KEY (`character_id`),
  ADD KEY `idx_char_user` (`user_id`),
  ADD KEY `idx_char_name` (`name`);

--
-- Indices de la tabla `game_state`
--
ALTER TABLE `game_state`
  ADD PRIMARY KEY (`game_state_id`),
  ADD UNIQUE KEY `character_id` (`character_id`),
  ADD KEY `idx_gs_character` (`character_id`),
  ADD KEY `idx_gs_campaign_section` (`campaign_id`,`current_section_id`);

--
-- Indices de la tabla `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `active_combats`
--
ALTER TABLE `active_combats`
  MODIFY `combat_id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'ID único del combate activo', AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `characters`
--
ALTER TABLE `characters`
  MODIFY `character_id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'Identificador único del personaje', AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT de la tabla `game_state`
--
ALTER TABLE `game_state`
  MODIFY `game_state_id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'ID único del estado guardado', AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT de la tabla `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'Identificador único del usuario';

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `active_combats`
--
ALTER TABLE `active_combats`
  ADD CONSTRAINT `fk_combat_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`character_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `game_state`
--
ALTER TABLE `game_state`
  ADD CONSTRAINT `fk_gamestate_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`character_id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
