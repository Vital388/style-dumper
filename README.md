# Style Dumper

A Chrome DevTools extension for extracting CSS styles and capturing screenshots of elements. Perfect for design documentation, debugging, and working with AI coding assistants.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=google-chrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

## Features

### 🎨 Style Extraction
- **Extract CSS styles** from any element on the page
- **Rules Only mode** - Get only properties explicitly set by CSS rules (filters out browser defaults)
- **All Computed mode** - Get every computed CSS property
- **Include child elements** - Extract styles for entire subtrees
- **Pseudo-elements support** - Capture `::before` and `::after` styles
- **HTML export** - Export element with inline styles applied

### 📸 Screenshots
- **Element screenshot** - Capture just the selected element
- **Page screenshot** - Capture the entire visible viewport
- **Smart naming** - Files named with hostname, element info, and timestamp

### 🎯 Flexible Element Selection
- **$0 selection** - Use currently selected element in DevTools Elements panel
- **CSS selector** - Target elements by selector
- **Element picker** - Click to select elements on the page

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/style-dumper.git
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked** and select the `extension` folder

5. Open DevTools (F12) on any page - you'll see a new **Style Dumper** tab

## Usage

### Extracting Styles

1. Open DevTools and go to the **Style Dumper** tab
2. Select your target element:
   - Select an element in the Elements panel (uses `$0`)
   - Or enter a CSS selector
   - Or use the picker to click an element
3. Choose extraction options:
   - **Rules Only** vs **All Computed**
   - Include **Child Elements**, **Pseudo-elements**, or **HTML Structure**
4. Click **Extract Styles**
5. Copy JSON or download the result

### Taking Screenshots

1. Select an element (for element screenshots)
2. Click **🎯 Element** to screenshot the selected element
3. Click **📄 Page** to screenshot the visible viewport

Screenshots are automatically downloaded with descriptive filenames like:
- `element_example.com_button-primary_20251215-143052.png`
- `page_example.com_Homepage_20251215-143105.png`

## Output Format

### Style JSON
```json
{
  "root": {
    "selector": "button.primary",
    "tag": "button",
    "styles": {
      "background-color": "rgb(0, 122, 204)",
      "border-radius": "4px",
      "color": "rgb(255, 255, 255)",
      "padding": "8px 16px"
    }
  },
  "stats": {
    "nodeCount": 1,
    "durationMs": 12
  }
}
```

### HTML Export
When "HTML Structure" is enabled, exports clean HTML with inline styles that can be rendered standalone.

## Use Cases

- 📋 **Design Documentation** - Capture exact styles for design systems
- 🤖 **AI Development** - Share element screenshots and styles with AI coding assistants
- 🐛 **Debugging** - Inspect computed styles and CSS cascade
- 🎨 **Style Auditing** - Analyze what CSS rules affect an element
- 📦 **Component Extraction** - Export styled HTML snippets

## Permissions

- `tabs` - Required to capture screenshots
- `<all_urls>` - Required to capture screenshots from any page

## Development

### Project Structure
```
extension/
├── manifest.json    # Extension manifest (V3)
├── devtools.html    # DevTools page entry
├── devtools.js      # Creates the panel
├── panel.html       # Panel UI
├── panel.js         # Panel logic & screenshot capture
├── panel.css        # Panel styles
├── dumper.js        # Style extraction logic (injected into page)
└── background.js    # Service worker for screenshot API
```

### Building
No build step required - the extension runs directly from source.

### Testing Changes
1. Make your changes
2. Go to `chrome://extensions`
3. Click the refresh icon on Style Dumper
4. Reopen DevTools

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this in your own projects.

---

Made with ❤️ for developers who work with AI assistants
