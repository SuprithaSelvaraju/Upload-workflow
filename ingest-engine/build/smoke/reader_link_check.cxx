// N0 link/run check. NOT N1 (no format behaviour is verified) and NOT engine code.
// Purpose: prove that the toolkits for all six reader paths link and load, and run headless
// (no display, no GL context). Every reader is called on a missing file and must fail cleanly.
// One in-memory BREP round trip proves that real I/O runs in the container.
#include <Standard_Version.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <IGESCAFControl_Reader.hxx>
#include <BRepTools.hxx>
#include <BinTools.hxx>
#include <BRep_Builder.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <RWStl.hxx>
#include <RWObj_CafReader.hxx>
#include <RWGltf_CafReader.hxx>
#include <TopoDS_Shape.hxx>
#include <Message_ProgressRange.hxx>
#include <iostream>
#include <cstdio>

static int g_fail = 0;
static void check(const char* what, bool ok) {
  std::cout << (ok ? "PASS  " : "FAIL  ") << what << "\n";
  if (!ok) ++g_fail;
}

int main() {
  std::cout << "OCCT version: " << OCC_VERSION_COMPLETE << "\n";
  const char* missing = "/nonexistent/agni_n0_missing_file";

  { STEPCAFControl_Reader r; check("STEP (STEPCAFControl_Reader) rejects missing file", r.ReadFile(missing) != IFSelect_RetDone); }
  { IGESCAFControl_Reader r; check("IGES (IGESCAFControl_Reader) rejects missing file", r.ReadFile(missing) != IFSelect_RetDone); }
  { TopoDS_Shape s; BRep_Builder b; check("BREP (BRepTools::Read) rejects missing file", !BRepTools::Read(s, missing, b)); }
  { TopoDS_Shape s; check("BREP binary (BinTools::Read) rejects missing file", !BinTools::Read(s, missing)); }
  { occ::handle<Poly_Triangulation> t = RWStl::ReadFile(missing); check("STL (RWStl::ReadFile) rejects missing file", t.IsNull()); }
  { RWObj_CafReader r; check("OBJ (RWObj_CafReader) rejects missing file", !r.Perform(TCollection_AsciiString(missing), Message_ProgressRange())); }
  { RWGltf_CafReader r; check("glTF (RWGltf_CafReader) rejects missing file", !r.Perform(TCollection_AsciiString(missing), Message_ProgressRange())); }

  { // runtime sanity only
    BRepPrimAPI_MakeBox mk(10.0, 20.0, 30.0);
    TopoDS_Shape box = mk.Shape();
    const char* path = "/tmp/agni_n0_box.brep";
    bool wrote = BRepTools::Write(box, path);
    TopoDS_Shape back; BRep_Builder b;
    bool read = wrote && BRepTools::Read(back, path, b);
    check("BREP round trip of a box (write, read) runs headless", wrote && read && !back.IsNull());
    std::remove(path);
  }
  std::cout << (g_fail == 0 ? "RESULT: all checks passed\n" : "RESULT: failures present\n");
  return g_fail == 0 ? 0 : 1;
}
