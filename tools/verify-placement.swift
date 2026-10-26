import Foundation
import CoreGraphics

@main struct PlacementChecks {
    static func main() {
        let visible=CGRect(x:0,y:77,width:2056,height:1213)
        let avatar=CGRect(x:1000,y:85,width:290,height:290)
        let offset:CGFloat=52
        let pinned=PetPlacement.clamp(frame:avatar,visible:visible,floorOffset:offset,attached:true)
        precondition(pinned.y==25 && pinned.y+offset==visible.minY,"feet must meet Dock, including transparent padding")
        var below=avatar;below.origin.y = -120
        precondition(PetPlacement.shouldAttach(frame:below,visible:visible,floorOffset:offset))
        precondition(PetPlacement.clamp(frame:below,visible:visible,floorOffset:offset,attached:false).y==25)
        var high=avatar;high.origin.y=500
        precondition(!PetPlacement.shouldAttach(frame:high,visible:visible,floorOffset:offset))
        precondition(PetPlacement.clamp(frame:high,visible:visible,floorOffset:offset,attached:false).y==500)
        let resized=PetPlacement.clamp(frame:avatar,visible:visible,floorOffset:80,attached:true)
        precondition(resized.y+80==77,"size/camera changes must preserve the Dock surface")
        let otherScreen=CGRect(x:-1600,y:-900,width:1600,height:900)
        let other=PetPlacement.clamp(frame:CGRect(x:-800,y:-850,width:210,height:210),visible:otherScreen,floorOffset:40,attached:true)
        precondition(other.y+40 == -900,"negative display coordinates must work")
        let hiddenDock=PetPlacement.clamp(frame:avatar,visible:CGRect(x:0,y:0,width:2056,height:1290),floorOffset:52,attached:true)
        precondition(hiddenDock.y+52==0,"hidden Dock must use the display edge")
        print("Dock placement: padding, drag limits, free placement, resize, other displays and hidden Dock verified")
    }
}
