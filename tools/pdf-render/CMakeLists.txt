cmake_minimum_required(VERSION 3.22)
project(pdf_render CXX)
set(CMAKE_CXX_STANDARD 17)

set(PDFIUM_ROOT "e:/Code/PDFium/pdfium" CACHE PATH "PDFium root")
set(PDFIUM_INCLUDE_DIR "${PDFIUM_ROOT}/public")
set(PDFIUM_LIB "${PDFIUM_ROOT}/out/Release_/obj/pdfium.lib")

if(MSVC)
  # pdfium.lib 以静态 CRT(/MT) 构建（LNK2038: MT_StaticRelease）；exe 必须一致
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

add_executable(pdf_render main.cpp)
target_include_directories(pdf_render PRIVATE "${PDFIUM_INCLUDE_DIR}")
target_link_libraries(pdf_render PRIVATE "${PDFIUM_LIB}" user32 gdi32 ole32 winmm)
