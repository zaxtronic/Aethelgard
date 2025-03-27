# Aethelgard: Crónicas de la Sombra Primigenia - Juego de Rol Web

[![Estado: Prototipo Funcional](https://img.shields.io/badge/Estado-Prototipo%20Funcional-yellowgreen)](https://zaxtronic.github.io/Aethelgard/index.html)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Jugar_Ahora-brightgreen)](https://zaxtronic.github.io/Aethelgard/index.html)
[![Licencia: Pendiente](https://img.shields.io/badge/License-Pendiente-red)](LICENSE) <!-- Asegúrate de añadir un archivo LICENSE -->

**Aethelgard: Crónicas de la Sombra Primigenia** es un juego de rol narrativo de **fantasía oscura**, presentado en formato de libro-juego digital interactivo, directamente en tu navegador web. Está inspirado en las reglas SRD 5.1 (System Reference Document de Dungeons & Dragons 5ª Edición bajo OGL) y te sumerge en un mundo decadente al borde del abismo.

**[➡️ ¡Juega la Demo en Vivo Aquí! ⬅️](https://zaxtronic.github.io/Aethelgard/index.html)**

<!-- ¡Considera añadir una captura de pantalla aquí! -->
<!-- ![Screenshot de Aethelgard Gameplay](URL_DE_TU_SCREENSHOT.png) -->

## Descripción del Juego

En el reino sombrío de Aethelgard, una influencia corruptora conocida como la **Sombra Primigenia** amenaza con consumirlo todo. Tú eres un aventurero que responde a la llamada para investigar y, quizás, detener esta creciente oscuridad.

Este proyecto web te permite:

1.  **Seleccionar una Aventura**: Elige entre las campañas disponibles.
2.  **Configurar tu Partida**: Indica cuántos jugadores participarán (esto ajusta la dificultad).
3.  **Jugar Interactivamente**: Navega por secciones narrativas, enfréntate a peligros, toma decisiones cruciales que afectan la historia y realiza tiradas de dados virtuales para superar desafíos.

## Características Actuales

*   **Motor de Juego Narrativo**: Avanza por secciones de historia interconectadas.
*   **Sistema de Decisiones**: Tus elecciones (botones de opción) determinan el flujo de la aventura.
*   **Pruebas de Habilidad (d20)**: Realiza tiradas de 1d20 + modificador contra una dificultad (CD) para acciones inciertas.
*   **Gestión de Personaje (Básica)**:
    *   El sistema sigue el XP, Nivel y Puntos de Vida (PV).
    *   El estado del personaje se guarda en `localStorage` para persistencia entre sesiones (sección actual, stats básicos).
    *   Opciones específicas de clase (p.ej., botón sólo habilitado para 'Guerrero').
*   **Información de Enemigos**: Muestra los tipos y cantidad de enemigos en una sección.
    *   **Escalado de Dificultad (Simulado)**: Los PV base de los enemigos se ajustan según el número de jugadores seleccionado (2, 3 o 4).
*   **Selección de Campaña**: Página dedicada (`select_campaign.html`) para elegir la aventura. Actualmente implementada:
    *   Capítulo 1: Las Minas Corruptas (Niveles 1-3)
*   **Interfaz Temática**: Diseño oscuro y fuentes evocadoras (`Cinzel Decorative`, `EB Garamond`) con Bootstrap 5.
*   **Simulación de Backend**: La lógica principal del juego (transiciones entre secciones, aplicación de XP/penalizaciones, resultados de chequeos, escalado) se **simula** actualmente dentro del JavaScript de `game_play.html`. **No requiere un servidor backend real.**
*   **Persistencia Local**: Utiliza `localStorage` para guardar la campaña seleccionada, el número de jugadores, la sección actual y el estado básico del personaje.
*   **Recursos Descargables (Links)**: Enlaces previstos para Reglas, Hechizos (SRD), y Ficha de Personaje en PDF (Asegúrate de que los archivos existen en el repositorio o apunta a URLs correctas).

## Demo / Cómo Jugar

1.  **Visita la página principal**: [https://zaxtronic.github.io/Aethelgard/index.html](https://zaxtronic.github.io/Aethelgard/index.html)
2.  **Explora la Introducción**: Lee sobre el juego, características y reglas básicas.
3.  **Elige Aventura**: Haz clic en el botón "Elige tu Aventura" para ir a `select_campaign.html`.
4.  **Selecciona Campaña y Jugadores**:
    *   Haz clic en una campaña **disponible** (actualmente "Capítulo 1: Las Minas Corruptas").
    *   Selecciona el número de jugadores (2, 3 o 4).
    *   Pulsa "Empezar Aventura Seleccionada".
5.  **Juega**: Serás redirigido a `game_play.html`. Lee la descripción de la sección y elige una de las opciones disponibles.
    *   Observa el estado de tu personaje en la barra superior.
    *   Algunas opciones requerirán una tirada de dados (simulada automáticamente).
    *   El progreso se guarda automáticamente en tu navegador.
6.  **Reiniciar**: Usa el enlace "Reiniciar Aventura" en la barra de navegación de la pantalla de juego para borrar el progreso guardado y volver a la selección de campaña (la implementación exacta de reset puede variar).

## Pila Tecnológica

*   HTML5
*   CSS3 (Estilos personalizados + Bootstrap 5.3)
*   JavaScript (Vanilla JS) - Incluye la lógica principal del juego simulada.
*   Google Fonts (`Cinzel Decorative`, `EB Garamond`)

## Desarrollo Local

Si quieres ejecutar o modificar el proyecto localmente:

1.  **Clona el repositorio**:
    ```bash
    git clone https://github.com/zaxtronic/Aethelgard.git
    ```
2.  **Navega al directorio**:
    ```bash
    cd Aethelgard-main
    ```
    *(O simplemente `cd Aethelgard` si esa es la carpeta raíz tras clonar)*
3.  **Abre `index.html`**: Abre el archivo `index.html` directamente en tu navegador web.

## Estado Actual y Futuro Trabajo

*   **Prototipo Funcional**: El motor básico de juego narrativo con opciones, chequeos, y persistencia local está implementado.
*   **Contenido Limitado**: Solo el primer capítulo ("Minas Corruptas") está activo. Otros capítulos están marcados como "Próximamente".
*   **Simulación de Lógica**: El "backend" está simulado en JS. Para mayor complejidad (inventario avanzado, combate detallado, magia compleja) podría requerirse un backend real o una estructura de datos JS más robusta.
*   **Personaje Simplificado**: La gestión actual del personaje es básica. Se podrían expandir stats, inventario, habilidades, etc.
*   **Platzhalters**: Reemplazar `[Tu Nombre/Grupo]` en el footer y asegurar que los links a PDFs/SRD (`[URL_HECHIZOS_SRD_AQUI]`) son correctos y los archivos están disponibles.

## Contribuciones

Las contribuciones son bienvenidas, especialmente para:

*   Expandir el contenido (más secciones, capítulos).
*   Mejorar la gestión del personaje.
*   Implementar un sistema de combate más detallado (si se desea).
*   Refinar la UI/UX.
*   Corregir bugs.

Si deseas contribuir, por favor abre un *issue* primero para discutir los cambios o envía un *pull request*.

## Licencia

Este proyecto aún no tiene una licencia definida. Por favor, añade un archivo `LICENSE` (ej. MIT, Apache 2.0) para clarificar cómo otros pueden usar o contribuir a tu código.
