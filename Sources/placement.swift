import Foundation
import CoreGraphics

enum PetPlacement {
    static func clamp(frame:CGRect, visible:CGRect, floorOffset:CGFloat, attached:Bool) -> CGPoint {
        let minimumY=visible.minY-floorOffset
        return CGPoint(
            x:max(visible.minX,min(frame.minX,visible.maxX-frame.width)),
            y:attached ? minimumY:max(minimumY,min(frame.minY,visible.maxY-frame.height))
        )
    }
    static func shouldAttach(frame:CGRect, visible:CGRect, floorOffset:CGFloat) -> Bool {
        frame.minY+floorOffset<=visible.minY+18
    }
}
