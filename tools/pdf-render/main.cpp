// pdf-render: 用 PDFium 把指定页范围渲染为 32bpp BMP，供原文/译文对比 QA。
// 用法: pdf_render.exe <input.pdf> <outdir> <startPage1> <endPage1> [scale]
#include <windows.h>

#include <cstdio>
#include <cwchar>
#include <string>
#include <vector>

#include "fpdfview.h"
#include "fpdf_doc.h"

static std::string toUtf8(const std::wstring& w) {
  if (w.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), s.data(), n, nullptr, nullptr);
  return s;
}

static bool writeBmp(const std::wstring& path, int w, int h, int stride, const unsigned char* buf) {
  BITMAPFILEHEADER fh = {};
  BITMAPINFOHEADER ih = {};
  ih.biSize = sizeof(ih);
  ih.biWidth = w;
  ih.biHeight = h;
  ih.biPlanes = 1;
  ih.biBitCount = 32;
  ih.biCompression = BI_RGB;
  ih.biSizeImage = (DWORD)((size_t)stride * h);
  fh.bfType = 0x4D42;
  fh.bfOffBits = sizeof(fh) + sizeof(ih);
  fh.bfSize = fh.bfOffBits + ih.biSizeImage;
  FILE* f = _wfopen(path.c_str(), L"wb");
  if (!f) return false;
  fwrite(&fh, 1, sizeof(fh), f);
  fwrite(&ih, 1, sizeof(ih), f);
  // PDFium 位图是自上而下 BGRA；BMP 需要自下而上，逐行翻转
  for (int y = h - 1; y >= 0; --y) fwrite(buf + (size_t)y * stride, 1, stride, f);
  fclose(f);
  return true;
}

int wmain(int argc, wchar_t** argv) {
  if (argc < 5) {
    fwprintf(stderr, L"usage: pdf_render.exe <input.pdf> <outdir> <startPage1> <endPage1> [scale]\n");
    return 2;
  }
  const std::wstring input = argv[1], outdir = argv[2];
  const int start = _wtoi(argv[3]) - 1;
  const int end = _wtoi(argv[4]) - 1;
  const double scale = argc > 5 ? _wtof(argv[5]) : 2.0;

  FPDF_InitLibrary();
  const std::string utf8Path = toUtf8(input);
  FPDF_DOCUMENT doc = FPDF_LoadDocument(utf8Path.c_str(), nullptr);
  if (!doc) {
    fwprintf(stderr, L"cannot open %s\n", input.c_str());
    FPDF_DestroyLibrary();
    return 1;
  }
  const int pageCount = FPDF_GetPageCount(doc);
  const int last = end < 0 ? pageCount - 1 : end;
  for (int i = start; i <= last && i < pageCount; ++i) {
    FPDF_PAGE page = FPDF_LoadPage(doc, i);
    if (!page) continue;
    const double pw = FPDF_GetPageWidthF(page);
    const double ph = FPDF_GetPageHeightF(page);
    const int w = (int)(pw * scale);
    const int h = (int)(ph * scale);
    FPDF_BITMAP bmp = FPDFBitmap_Create(w, h, 1 /*BGRA*/);
    FPDFBitmap_FillRect(bmp, 0, 0, w, h, 0xFFFFFFFF);
    FPDF_RenderPageBitmap(bmp, page, 0, 0, w, h, 0, FPDF_ANNOT | FPDF_LCD_TEXT);
    std::wstring outPath = outdir + L"\\page_" + std::to_wstring(i + 1) + L".bmp";
    writeBmp(outPath, w, h, FPDFBitmap_GetStride(bmp), (const unsigned char*)FPDFBitmap_GetBuffer(bmp));
    FPDFBitmap_Destroy(bmp);
    FPDF_ClosePage(page);
  }
  FPDF_CloseDocument(doc);
  FPDF_DestroyLibrary();
  return 0;
}
