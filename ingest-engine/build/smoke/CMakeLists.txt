cmake_minimum_required(VERSION 3.16)
project(agni_occt_link_check CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
find_package(OpenCASCADE REQUIRED CONFIG)
add_executable(reader_link_check reader_link_check.cxx)
target_link_libraries(reader_link_check PRIVATE
  TKDESTEP TKDEIGES TKDESTL TKDEOBJ TKDEGLTF TKDECascade TKRWMesh TKDE TKMesh TKBRep TKPrim
  TKXCAF TKLCAF TKCDF TKG3d TKG2d TKMath TKernel)
