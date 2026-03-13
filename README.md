# ⚡ Advanced DataTable PCF Control


![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![PowerApps](https://img.shields.io/badge/PowerApps-PCF-purple.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**A feature-rich, highly customizable DataTable component for Power Apps**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Customization](#-customization) • [Demo](#-demo)


---

## 📋 Overview

Advanced DataTable is a professional-grade Power Apps Component Framework (PCF) control that transforms your data grids into powerful, interactive tables with enterprise-level features. Built with TypeScript and optimized for performance, it seamlessly works with any Dataverse entity.

### ✨ Why Choose This Control?

- 🚀 **Zero Configuration Required** - Works out of the box with any entity
- 🎨 **23+ Styling Properties** - Fully customizable appearance
- 🔍 **Smart Search & Filtering** - Global search + per-column filters
- 📊 **Unlimited Records** - Automatic loading bypasses 50-record limit
- ⚡ **High Performance** - Optimized rendering with debounced updates
- 🎯 **Production Ready** - Battle-tested in enterprise environments
- 🌈 **Pre-built Themes** - 7+ ready-to-use color schemes
- ♿ **Accessible** - WCAG 2.1 compliant

---

## 🎯 Features

### 🔍 **Search & Filter**
- **Global Search** - Search across all columns simultaneously
- **Column Filters** - Individual filter inputs for each column
- **Real-time Updates** - 300ms debounced for smooth performance
- **Clear All** - Quick reset button for filters

### 📊 **Data Management**
- **Auto-Loading** - Automatically loads all records (no 50-record limit)
- **Smart Sorting** - Click any header to sort ascending/descending
- **Multi-Select** - Checkbox or radio button selection modes
- **Row Selection** - Click rows to open records (respects security roles)

### 📄 **Pagination**
- **Customizable Page Size** - 10, 25, 50, 100+ records per page
- **Smart Navigation** - First, Previous, Next, Last buttons
- **Page Indicators** - Visual feedback of current page
- **Total Count** - Shows filtered vs total records

### 🎨 **Advanced Styling**
- **Color Customization** - 10 color properties for complete theming
- **Layout Control** - Row height, padding, borders, radius
- **Typography** - Font family, size, weight customization
- **Visual Effects** - Hover states, row stripes, shadow levels
- **Responsive Design** - Adapts to mobile, tablet, desktop

### ⚙️ **Configuration**
- **Toggle Features** - Enable/disable sorting, filtering, paging
- **Hidden Columns** - Hide specific columns by name
- **Selection Modes** - Single or multi-select
- **Dynamic Updates** - All properties update in real-time

---

## 📸 Screenshots

### Default Theme
![Default Theme](./assets/screenshot-default.png)

### Dark Mode
![Dark Mode](./assets/screenshot-dark.png)

### Filtering & Search
![Filtering](./assets/screenshot-filtering.png)

### Mobile Responsive
![Mobile](./assets/screenshot-mobile.png)

---

## 🚀 Installation

### Prerequisites
- Power Apps CLI ([Install Guide](https://docs.microsoft.com/powerapps/developer/data-platform/powerapps-cli))
- Node.js 16+ ([Download](https://nodejs.org/))
- Power Apps environment with Dataverse

### Method 1: Import Solution (Recommended)

1. **Download the latest release**
   ```bash
   # Download from Releases page
   wget https://github.com/YourUsername/DataTable-PCF/releases/latest/download/DataTableSolution.zip
