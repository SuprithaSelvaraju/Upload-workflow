# N0: initial CMake cache for the AgniKawach native engine's OCCT build.
# Single source of truth for the module/option set. Used as: cmake -C occt-engine-options.cmake ...
# Status: PROPOSED (plan section F, slice N0). Every value here is verified only by the recorded runs in records/.

# --- Version/standard -------------------------------------------------------
set(BUILD_CPP_STANDARD "C++17" CACHE STRING "")          # C++17 is the 8.0.x minimum [plan C.1]
set(CMAKE_BUILD_TYPE "Release" CACHE STRING "")
set(BUILD_LIBRARY_TYPE "Shared" CACHE STRING "")         # shared vs static is an open decision (UQ-5, LGPL); Shared used for N0

# --- Module set --------------------------------------------------------------
# All OCCT modules OFF; the toolkits the engine needs are requested explicitly and OCCT's own
# dependency extraction (EXCTRACT_TOOLKIT_FULL_DEPS in CMakeLists.txt) adds their prerequisites.
set(BUILD_MODULE_FoundationClasses  OFF CACHE BOOL "")
set(BUILD_MODULE_ModelingData       OFF CACHE BOOL "")
set(BUILD_MODULE_ModelingAlgorithms OFF CACHE BOOL "")
set(BUILD_MODULE_Visualization      OFF CACHE BOOL "")
set(BUILD_MODULE_ApplicationFramework OFF CACHE BOOL "")
set(BUILD_MODULE_DataExchange       OFF CACHE BOOL "")
set(BUILD_MODULE_Draw               OFF CACHE BOOL "")
set(BUILD_ADDITIONAL_TOOLKITS
    "TKDESTEP TKDEIGES TKDESTL TKDEOBJ TKDEGLTF TKDECascade TKRWMesh TKDE TKMesh TKBRep TKPrim"
    CACHE STRING "")

# --- Third-party switches ------------------------------------------------------
set(USE_FREETYPE  ON  CACHE BOOL "")   # TKService external; needed for Visualization toolkits that TKRWMesh depends on
set(USE_RAPIDJSON ON  CACHE BOOL "")   # glTF reader code is guarded by HAVE_RAPIDJSON
set(USE_DRACO     OFF CACHE BOOL "")   # Draco decode/encode not built in N0 (decision recorded in the ADR)
set(USE_TBB       OFF CACHE BOOL "")   # parallel meshing via TBB is an N2 question
set(USE_FREEIMAGE OFF CACHE BOOL "")
set(USE_FFMPEG    OFF CACHE BOOL "")
set(USE_OPENVR    OFF CACHE BOOL "")
set(USE_EIGEN     OFF CACHE BOOL "")
set(USE_TK        OFF CACHE BOOL "")
set(USE_OPENGL    OFF CACHE BOOL "")
set(USE_GLES2     OFF CACHE BOOL "")

# --- Non-product content -------------------------------------------------------
set(BUILD_GTEST  OFF CACHE BOOL "")
set(BUILD_DOC_Overview OFF CACHE BOOL "")
set(BUILD_DOC_RefMan   OFF CACHE BOOL "")
set(INSTALL_TEST_CASES OFF CACHE BOOL "")
set(BUILD_USE_PCH OFF CACHE BOOL "")
