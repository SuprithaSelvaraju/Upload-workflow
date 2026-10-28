#include <Standard_Version.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <IGESCAFControl_Reader.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <XCAFApp_Application.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <TDF_LabelSequence.hxx>
#include <TopoDS_Shape.hxx>
#include <TopExp_Explorer.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BinTools.hxx>
#include <RWStl.hxx>
#include <RWObj_CafReader.hxx>
#include <RWGltf_CafReader.hxx>
#include <Message_ProgressRange.hxx>
#include <TCollection_AsciiString.hxx>
#include <Poly_Triangulation.hxx>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
  if (argc != 2) {
    std::cerr << "Usage: real_file_check <cad-file>\n";
    return 2;
  }

  const std::filesystem::path path(argv[1]);
  if (!std::filesystem::is_regular_file(path)) {
    std::cerr << "ERROR: File does not exist: " << path << "\n";
    return 2;
  }

  const auto bytes = std::filesystem::file_size(path);
  const auto ext = path.extension().string();
  const auto start = std::chrono::steady_clock::now();
  bool ok = false;
  int shapes = 0, faces = 0, solids = 0, triangles = 0;
  std::string method = "unknown";

  try {
    if (ext == ".step" || ext == ".STEP" ||
        ext == ".stp" || ext == ".STP") {
      method = "STEPCAFControl_Reader";
      STEPCAFControl_Reader reader;
      const auto status = reader.ReadFile(path.string().c_str());
      if (status == IFSelect_RetDone) {
        Handle(TDocStd_Document) doc;
        XCAFApp_Application::GetApplication()->NewDocument("MDTV-XCAF", doc);
        if (!doc.IsNull() && reader.Transfer(doc)) {
          TDF_LabelSequence labels;
          XCAFDoc_DocumentTool::ShapeTool(doc->Main())->GetFreeShapes(labels);
          shapes = labels.Length();
          for (int i = 1; i <= labels.Length(); ++i) {
            const TopoDS_Shape shape =
                XCAFDoc_DocumentTool::ShapeTool(doc->Main())->GetShape(labels.Value(i));
            if (shape.IsNull()) continue;
            for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) ++faces;
            for (TopExp_Explorer it(shape, TopAbs_SOLID); it.More(); it.Next()) ++solids;
            if (!BRepCheck_Analyzer(shape).IsValid()) {
              std::cerr << "WARNING: At least one top-level shape failed BRepCheck.\n";
            }
          }
          ok = shapes > 0;
          XCAFApp_Application::GetApplication()->Close(doc);
        }
      }
    } else if (ext == ".igs" || ext == ".IGS" ||
               ext == ".iges" || ext == ".IGES") {
      method = "IGESCAFControl_Reader";
      IGESCAFControl_Reader reader;
      if (reader.ReadFile(path.string().c_str()) == IFSelect_RetDone &&
          reader.TransferRoots()) {
        Handle(TDocStd_Document) doc;
        XCAFApp_Application::GetApplication()->NewDocument("MDTV-XCAF", doc);
        if (!doc.IsNull() && reader.Transfer(doc)) {
          TDF_LabelSequence labels;
          XCAFDoc_DocumentTool::ShapeTool(doc->Main())->GetFreeShapes(labels);
          shapes = labels.Length();
          for (int i = 1; i <= labels.Length(); ++i) {
            const TopoDS_Shape shape =
                XCAFDoc_DocumentTool::ShapeTool(doc->Main())->GetShape(labels.Value(i));
            if (shape.IsNull()) continue;
            for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) ++faces;
            for (TopExp_Explorer it(shape, TopAbs_SOLID); it.More(); it.Next()) ++solids;
          }
          ok = shapes > 0;
          XCAFApp_Application::GetApplication()->Close(doc);
        }
      }
    } else if (ext == ".brep" || ext == ".BREP") {
      method = "BRepTools::Read";
      TopoDS_Shape shape;
      BRep_Builder builder;
      ok = BRepTools::Read(shape, path.string().c_str(), builder) && !shape.IsNull();
      if (ok) {
        for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) ++faces;
        for (TopExp_Explorer it(shape, TopAbs_SOLID); it.More(); it.Next()) ++solids;
        shapes = 1;
      }
    } else if (ext == ".stl" || ext == ".STL") {
      method = "RWStl::ReadFile";
      auto mesh = RWStl::ReadFile(path.string().c_str());
      ok = !mesh.IsNull();
      if (ok) triangles = mesh->NbTriangles();
    } else if (ext == ".obj" || ext == ".OBJ") {
      method = "RWObj_CafReader";
      RWObj_CafReader reader;
      ok = reader.Perform(TCollection_AsciiString(path.string().c_str()),
                          Message_ProgressRange());
    } else if (ext == ".gltf" || ext == ".GLTF" ||
               ext == ".glb" || ext == ".GLB") {
      method = "RWGltf_CafReader";
      RWGltf_CafReader reader;
      ok = reader.Perform(TCollection_AsciiString(path.string().c_str()),
                          Message_ProgressRange());
    } else {
      std::cerr << "ERROR: Unsupported extension: " << ext << "\n";
      return 2;
    }
  } catch (const Standard_Failure& e) {
    std::cerr << "OCCT exception: " << e.GetMessageString() << "\n";
  } catch (const std::exception& e) {
    std::cerr << "Exception: " << e.what() << "\n";
  }

  const auto elapsed = std::chrono::duration<double>(
      std::chrono::steady_clock::now() - start).count();

  std::cout << "OCCT version: " << OCC_VERSION_COMPLETE << "\n"
            << "File: " << path.filename().string() << "\n"
            << "Bytes: " << bytes << "\n"
            << "Reader: " << method << "\n"
            << "Import seconds: " << elapsed << "\n"
            << "Top-level shapes: " << shapes << "\n"
            << "Faces: " << faces << "\n"
            << "Solids: " << solids << "\n"
            << "STL triangles: " << triangles << "\n"
            << "RESULT: " << (ok ? "IMPORT SUCCEEDED" : "IMPORT FAILED") << "\n";

  return ok ? 0 : 1;
}

