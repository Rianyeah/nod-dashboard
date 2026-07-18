export function domElement(tag, { className, style, attributes } = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (style) Object.assign(element.style, style);
  if (attributes) {
    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, String(value));
    });
  }
  return element;
}

export function textElement(tag, text, options = {}) {
  const element = domElement(tag, options);
  element.textContent = text == null ? '' : String(text);
  return element;
}

export function appendTextRow(parent, label, value, { className, style } = {}) {
  const row = domElement('div', { className, style });
  row.append(textElement('span', label), textElement('strong', value));
  parent.append(row);
  return row;
}

export function popupContent(rows, className = '') {
  const root = domElement('div', { className });
  rows.forEach(([label, value]) => appendTextRow(root, label, value));
  return root;
}
