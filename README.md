# WXT + Vue 3

This project is a Chrome extension built with WXT and Vue 3, designed to track time spent on websites and provide insightful statistics.

## Core Features

The extension offers the following core functionalities:

*   **Website Time Tracking**: Automatically records the time spent on different websites.
*   **Multi-Level Statistics**:
    *   **By Domain**: Aggregates time spent per top-level domain (e.g., `google.com`).
    *   **By Hostname**: Provides detailed statistics for specific hostnames (e.g., `mail.google.com`, `docs.google.com`).
    *   **By Path**: Allows fine-grained analysis of time spent on specific pages or sections of a website.
*   **Time Calculation Methods**:
    *   **Tab Open/Close**: Calculates total time from when a tab is opened until it's closed.
    *   **Active/Inactive State**: Tracks user activity to differentiate between active engagement and idle time.

## Recommended IDE Setup

-   [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (or [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) if using Volar).

## Project Structure

For an overview of the project's architecture and module responsibilities, please refer to the README files within the respective directories, particularly:

*   `src/README.md`: For an overview of the source code structure.
*   `src/core/README.md`: For details on the core business logic.
*   `src/services/README.md`: For information on technical services.
*   `src/models/README.md`: For data model definitions enlight
*   `tests/README.md`: For testing strategies and structure.