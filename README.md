# Web Time Tracker

[![Built with WXT](https://img.shields.io/badge/Built%20with-WXT-purple.svg)](https://wxt.dev)
[![Vue.js](https://img.shields.io/badge/Vue.js-3-green.svg)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-992d81.svg)](https://vitest.dev/)

Web Time Tracker is a browser extension that helps you understand how you spend your time online. It automatically tracks the time spent on different websites and provides detailed reports.

## Features

- **Automatic Time Tracking:** Tracks time spent on websites without manual intervention.
- **Detailed Reporting:** View time spent per domain, hostname, or even specific paths.
- **Activity Detection:** Differentiates between active and inactive time to provide more accurate insights. (Future enhancement)
- **Data Storage:** Uses IndexedDB to store data locally in your browser.
- **Privacy Focused:** All tracking data remains on your device.

## Installation

### From Source (for Developers)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/web-time-tracker.git
    cd web-time-tracker
    ```
2.  **Install dependencies:**
    This project uses `pnpm` as the package manager.
    ```bash
    pnpm install
    ```
3.  **Build the extension for development:**
    ```bash
    pnpm dev
    ```
    This will create an `unpacked` extension in the `.output` directory.
4.  **Load the extension in your browser:**
    *   **Chrome/Edge:**
        1.  Open `chrome://extensions` or `edge://extensions`.
        2.  Enable "Developer mode".
        3.  Click "Load unpacked".
        4.  Select the `.output/chrome-mv3` directory.
    *   **Firefox:**
        1.  Open `about:debugging#/runtime/this-firefox`.
        2.  Click "Load Temporary Add-on...".
        3.  Select the `.output/firefox-mv2/manifest.json` file (or any file within that directory).

### Production Build

To create a production-ready build:

```bash
pnpm build
```

This will generate optimized builds in the `.output` directory. To create a distributable ZIP file:

```bash
pnpm zip
```

## Usage

Once installed, the extension will automatically start tracking your browsing activity.

-   **Popup:** Click on the extension icon in your browser's toolbar to open the popup. This will display a summary of your tracked time and provide access to more detailed reports.
-   **Options Page:** (If applicable, describe how to access and what it does)

### How Time is Calculated

The extension aims to provide flexible time tracking:

-   **By Domain:** Aggregates time spent on all pages under a specific domain (e.g., `google.com`).
-   **By Hostname:** Differentiates between subdomains (e.g., `mail.google.com` vs. `docs.google.com`).
-   **By Path:** Tracks time spent on specific pages or sections of a website.
-   **Open-Close vs. Active-Inactive:**
    -   Currently, time is primarily calculated based on the duration a tab/page is open.
    -   Future enhancements will incorporate more sophisticated active vs. inactive time detection (e.g., based on mouse movement, keyboard input, or page visibility).

## Development

This project is built using [WXT](https://wxt.dev/), [Vue 3](https://vuejs.org/), and [TypeScript](https://www.typescriptlang.org/).

### Project Structure

```
.
├── public/             # Static assets
├── src/
│   ├── assets/         # Assets used in Vue components
│   ├── components/     # Vue components
│   ├── db/             # Dexie.js database setup, models, repositories, services
│   ├── entrypoints/    # Extension entrypoints (background, popup, options, content scripts)
│   ├── store/          # (If using a state management library like Pinia)
│   └── utils/          # Utility functions
├── tests/              # Unit, integration, and performance tests
├── wxt.config.ts       # WXT configuration
├── package.json        # Project dependencies and scripts
└── README.md           # This file
```

### Key Scripts

-   `pnpm dev`: Starts the development server with hot reloading.
-   `pnpm build`: Creates a production build.
-   `pnpm zip`: Creates a distributable ZIP file of the extension.
-   `pnpm test:watch`: Runs tests in watch mode.
-   `pnpm test:run`: Runs all tests.
-   `pnpm lint`: Lints the codebase using ESLint.
-   `pnpm format`: Formats the code using Prettier.
-   `pnpm check`: Runs formatting, linting, and type checking.

Refer to `package.json` for a full list of scripts.

### Database

The extension uses [Dexie.js](https://dexie.org/) for managing the IndexedDB database.
-   Schema definitions are in `src/db/schemas/`.
-   Database models (if using classes for table rows) are in `src/db/models/`.
-   Repositories for data access are in `src/db/repositories/`.
-   The main database service is `src/db/services/database.service.ts`.

## Testing

Tests are written using [Vitest](https://vitest.dev/).

-   **Unit Tests:** Located in `tests/unit/`.
-   **Integration Tests:** Located in `tests/integration/`.
-   **Performance Tests:** Located in `tests/performance/`.

Run tests using the scripts mentioned above (e.g., `pnpm test:run`).

## Contributing

Contributions are welcome! If you'd like to contribute, please:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Ensure your changes pass linting and tests (`pnpm check` and `pnpm test:run`).
5.  Commit your changes (`git commit -am 'Add some feature'`).
6.  Push to the branch (`git push origin feature/your-feature-name`).
7.  Create a new Pull Request.

Please ensure your code adheres to the existing coding style and conventions.

## License

This project is licensed under the [MIT License](LICENSE). (Note: You'll need to add a LICENSE file if one doesn't exist).

---

*This README was generated with assistance from an AI coding partner.*
