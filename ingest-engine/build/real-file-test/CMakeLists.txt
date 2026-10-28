cmake_minimum_required(VERSION 3.16)
project(agni_occt_real_file_check CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(OpenCASCADE REQUIRED CONFIG)

add_executable(real_file_check real_file_check.cxx)

target_link_libraries(real_file_check PRIVATE
  TKDESTEP TKDEIGES TKDESTL TKDEOBJ TKDEGLTF TKRWMesh
  TKDE TKMesh TKBRep TKPrim TKXCAF TKLCAF TKCDF
  TKTopAlgo TKShHealing TKGeomAlgo TKGeomBase
  TKG3d TKG2d TKMath TKernel)
