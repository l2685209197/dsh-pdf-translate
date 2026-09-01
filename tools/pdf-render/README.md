# pdf-render（QA 工具）

用现有 PDFium 静态库把 PDF 页渲染为 32bpp BMP，用于原文/译文页对比 QA（独立渲染器交叉验证 PyMuPDF 输出）。

```bash
cmake -S tools/pdf-render -B tools/pdf-render/build
cmake --build tools/pdf-render/build --config Release
tools/pdf-render/build/Release/pdf_render.exe input.pdf outdir 1 3 2.0
```

对比方法：分别渲染原文与译文 PDF 的同页 BMP，用图片查看器/像素 diff 检查布局偏移、字体变化。
