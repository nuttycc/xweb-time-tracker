# Web Time Tracker

<p align="center">
  <a href="https://wxt.dev"
    ><img
      src="https://img.shields.io/badge/Built%20with-WXT-purple.svg"
      alt="Built with WXT"
  /></a>
  <a href="https://vuejs.org/"
    ><img
      src="https://img.shields.io/badge/Vue.js-3-green.svg"
      alt="Vue.js"
  /></a>
  <a href="https://tailwindcss.com/"
    ><img
      src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white"
      alt="Tailwind CSS"
  /></a>
  <a href="https://deepwiki.com/nuttycc/xweb-time-tracker"
    ><img
      src="https://deepwiki.com/badge.svg"
      alt="Ask DeepWiki"
  /></a>
</p>

Web Time Tracker is a browser extension that helps you understand how you spend your time online. It automatically tracks the time spent on different websites and provides detailed, privacy-focused reports right in your browser.

## About The Project

In an age of constant digital distraction, understanding where your time goes is the first step toward better productivity and digital well-being. Web Time Tracker is a modern, lightweight, and privacy-first browser extension designed to provide automatic, detailed insights into your browsing habits. All your data stays on your device, ensuring complete privacy.

## Key Features

- **Automatic Time Tracking:** Seamlessly records time spent on websites in the background without any manual input.
- **Detailed Reporting:** Visualize your time with aggregated data per domain, hostname, or specific page.
- **Privacy Focused:** All tracking data is stored locally in your browser's IndexedDB and never leaves your device.
- **Advanced Duplicate Prevention:** A sophisticated dual-layer mechanism minimizes duplicate time entries, ensuring data accuracy.
- **Activity Detection:** (Coming soon) Intelligently distinguishes between active and idle time for more precise tracking.
- **Modern, Performant Stack:** Built with Vue 3, WXT, and TypeScript for a fast and reliable experience.

## Technology Stack

- **Framework**: [WXT](https://wxt.dev/), [Vue 3](https://vuejs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [Dexie.js](https://dexie.org/) (IndexedDB Wrapper)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **State Management & Utilities**: [@vueuse/core](https://vueuse.org/), [date-fns](https://date-fns.org/)
- **Development & Build**: [Vite](https://vitejs.dev/), [pnpm](https://pnpm.io/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Linting & Formatting**: [ESLint](https://eslint.org/), [Prettier](https://prettier.io/), [Oxlint](https://oxc-project.github.io/docs/linter/introduction.html)


## Screenshots

<p align="center">
  <img alt="Screenshot 1" src="https://image.dooo.ng/c/2025/07/15/68766b024a59c.webp" width="250" />
  <img alt="Screenshot 2" src="https://image.dooo.ng/c/2025/07/15/68766b0281652.webp" width="250" />
</p>

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- [pnpm](https://pnpm.io/installation)

### Installation & Development

1.  **Clone the repository**
2.  **Install dependencies**
    ```sh
    pnpm install
    ```
3.  **Start the development server**
    ```sh
    pnpm dev
    ```
4.  Load the extension in your browser by pointing it to the generated `dist/` or `.output/` directory.

### Building for Production

To create a production-ready build, run:
```sh
pnpm build
```
This will generate a ZIP file in the `dist/` directory, ready for submission to browser extension stores.

---

_This README was generated with assistance from an AI coding partner._
