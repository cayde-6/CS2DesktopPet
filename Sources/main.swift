import AppKit
import WebKit

func log(_ text: String) {
    let line = "\(Date()): \(text)\n"
    let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("cs2-pet.log")
    if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
    if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close() }
}

final class PetPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
    override func constrainFrameRect(_ frameRect:NSRect,to screen:NSScreen?) -> NSRect { frameRect }
}

struct PetAnimation: Decodable {
    let name:String
    let label:String
    let group:String
    let library:String
}

final class PetTouchView: NSView {
    weak var host: PetController?
    var startMouse = NSPoint.zero
    var startOrigin = NSPoint.zero
    var didDrag = false
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) {
        guard let host else { return }
        startMouse = NSEvent.mouseLocation; startOrigin = host.panel.frame.origin
        didDrag = false; host.dragging = true
    }
    override func mouseDragged(with event: NSEvent) {
        guard let host else { return }
        let now = NSEvent.mouseLocation
        if hypot(now.x-startMouse.x, now.y-startMouse.y)>3 { didDrag = true }
        if didDrag { host.attachedToDock=false;host.preciseX=nil }
        host.panel.setFrameOrigin(NSPoint(x: startOrigin.x+now.x-startMouse.x, y: startOrigin.y+now.y-startMouse.y))
    }
    override func mouseUp(with event: NSEvent) {
        guard let host else { return }
        host.dragging = false
        if didDrag { host.attachedToDock=PetPlacement.shouldAttach(frame:host.panel.frame,visible:host.currentScreen().visibleFrame,floorOffset:host.floorOffset) }
        host.clampToScreen(); host.waitUntil = Date().addingTimeInterval(3)
        if !didDrag { host.react("pet") }
        host.savePosition()
    }
    override func rightMouseDown(with event: NSEvent) {
        if let menu = host?.makeMenu() { NSMenu.popUpContextMenu(menu, with: event, for: self) }
    }
}

final class PetController: NSObject, WKScriptMessageHandler {
    let panel: PetPanel
    let web: WKWebView
    let touch = PetTouchView()
    var timer: Timer?
    var status: NSStatusItem!
    var direction: Double = 1
    var dragging = false
    var paused = UserDefaults.standard.bool(forKey: "paused")
    var roaming = !UserDefaults.standard.bool(forKey: "stay")
    var top = !UserDefaults.standard.bool(forKey: "desktopLevel")
    var selected = UserDefaults.standard.string(forKey: "bird") ?? "chick"
    var size: CGFloat = CGFloat(UserDefaults.standard.double(forKey: "size"))
    var ready = false
    var waitUntil = Date().addingTimeInterval(4)
    var walkUntil = Date.distantPast
    var wasMoving = false
    var previousState = ""
    var lastTick = Date()
    var sleeping = false
    var motionQA: (start:Date,last:Date,distance:Double,frames:Int)?
    var captureStarted=false
    var preciseX:CGFloat?
    var activityBusy=false
    var actionMoving=false
    var activityName:String?
    var autonomous = !UserDefaults.standard.bool(forKey:"noAutonomous")
    var soundsEnabled = !UserDefaults.standard.bool(forKey:"muted")
    var nextActionAt=Date().addingTimeInterval(12)
    var activeSound:NSSound?
    var floorOffset:CGFloat=0
    var attachedToDock=UserDefaults.standard.object(forKey:"attachedToDock") as? Bool ?? true
    var lastDockTarget:CGFloat?
    var lastDockY:CGFloat?
    let birds = [("chick", "Chick"), ("chicken", "Catalana chicken"), ("chicken_silkie", "Silkie chicken"), ("chicken_polish", "Polish chicken")]
    let animationCatalog:[PetAnimation] = {
        guard let url=Bundle.main.url(forResource:"animations",withExtension:"json"),let data=try? Data(contentsOf:url),let entries=try? JSONDecoder().decode([PetAnimation].self,from:data) else { return [] }
        return entries
    }()

    override init() {
        if size < 120 { size = 210 }
        let config = WKWebViewConfiguration()
        web = WKWebView(frame: .zero, configuration: config)
        panel = PetPanel(contentRect: NSRect(x: 300,y: 100,width: size,height: size), styleMask: [.borderless,.nonactivatingPanel], backing: .buffered, defer: false)
        super.init()
        if let argument=ProcessInfo.processInfo.arguments.first(where:{$0.hasPrefix("--qa-bird=")}) {
            let bird=argument.replacingOccurrences(of:"--qa-bird=",with:"")
            if birds.contains(where:{$0.0==bird}) { selected=bird }
        }
        config.userContentController.add(self, name: "pet")
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = false
        panel.isReleasedWhenClosed = false; panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces,.fullScreenAuxiliary,.stationary,.ignoresCycle]
        panel.level = top ? .floating : NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow))+1)
        panel.acceptsMouseMovedEvents = true
        let container = NSView(frame: NSRect(x:0,y:0,width:size,height:size))
        web.frame = container.bounds; web.autoresizingMask = [.width,.height]
        web.setValue(false, forKey: "drawsBackground")
        web.isInspectable = true
        container.addSubview(web)
        touch.frame = container.bounds; touch.autoresizingMask = [.width,.height]; touch.host = self
        container.addSubview(touch); panel.contentView = container
        if UserDefaults.standard.object(forKey:"x") != nil {
            panel.setFrameOrigin(NSPoint(x:UserDefaults.standard.double(forKey:"x"),y:UserDefaults.standard.double(forKey:"y")))
        } else if let screen = NSScreen.main {
            panel.setFrameOrigin(NSPoint(x:screen.visibleFrame.midX,y:screen.visibleFrame.minY+8))
        }
        clampToScreen()
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        status.button?.title = "🐥"; status.button?.toolTip = "CS2 Pet — desktop companion"
        refreshMenu()
        if let url = Bundle.main.url(forResource:"index",withExtension:"html"), let html = try? String(contentsOf:url,encoding:.utf8) {
            web.loadHTMLString(html,baseURL:nil)
        }
        panel.orderFrontRegardless()
        timer = Timer(timeInterval:1.0/30.0,target:self,selector:#selector(tick),userInfo:nil,repeats:true)
        RunLoop.main.add(timer!,forMode:.common)
        NSWorkspace.shared.notificationCenter.addObserver(self,selector:#selector(sleepNow),name:NSWorkspace.willSleepNotification,object:nil)
        NSWorkspace.shared.notificationCenter.addObserver(self,selector:#selector(wakeNow),name:NSWorkspace.didWakeNotification,object:nil)
        NotificationCenter.default.addObserver(self,selector:#selector(screenChanged),name:NSApplication.didChangeScreenParametersNotification,object:nil)
        log("started bird=\(selected)")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let obj=message.body as? [String:Any],let type=obj["type"] as? String else { return }
        if type=="quality_done" && ProcessInfo.processInfo.arguments.contains("--render-exit") { NSApp.terminate(nil);return }
        if type=="library",let key=obj["value"] as? String {
            guard ["behaviors","poses","showcase","held"].contains(key) else { return }
            loadAnimationLibrary(key);return
        }
        if type=="action_motion",let moving=obj["value"] as? Bool { actionMoving=moving;return }
        if type=="floor",let offset=obj["value"] as? Double,offset.isFinite,offset>=0,offset<Double(panel.frame.height) {
            floorOffset=CGFloat(offset)
            if !dragging {
                if attachedToDock { alignToDock() } else { clampToScreen() }
            }
            return
        }
        if type=="quality_frame",let label=obj["value"] as? String {
            web.takeSnapshot(with:nil) { image,error in
                if let tiff=image?.tiffRepresentation,let rep=NSBitmapImageRep(data:tiff),let png=rep.representation(using:.png,properties:[:]) {
                    let prefix=ProcessInfo.processInfo.arguments.first(where:{$0.hasPrefix("--quality-label=")})?.replacingOccurrences(of:"--quality-label=",with:"")
                    let name=prefix.map { "\($0)-\(label)" } ?? label
                    try? png.write(to:URL(fileURLWithPath:"/tmp/cs2-pet-quality-\(name).png"));log("quality snapshot \(name)")
                }else{log("quality snapshot error \(String(describing:error))")}
                self.js("window.petNextQuality()")
            }
            return
        }
        if type=="preview" {
            guard let value=obj["value"] as? [String:Any],let label=value["label"] as? String,
                  let png=value["png"] as? String,let encoded=png.split(separator:",").last,
                  let data=Data(base64Encoded:String(encoded)) else { return }
            let folder=URL(fileURLWithPath:"/tmp/cs2-pet-actions-preview",isDirectory:true)
            try? FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
            try? data.write(to:folder.appendingPathComponent(label+".png"))
            return
        }
        if type=="capture" {
            guard let value=obj["value"] as? [String:Any],let frame=value["frame"] as? Int,
                  let png=value["png"] as? String,let encoded=png.split(separator:",").last,
                  let data=Data(base64Encoded:String(encoded)) else { return }
            let label=ProcessInfo.processInfo.arguments.first(where:{$0.hasPrefix("--capture-label=")})?.replacingOccurrences(of:"--capture-label=",with:"") ?? "test"
            let folder=URL(fileURLWithPath:"/tmp/cs2-pet-motion-\(label)",isDirectory:true)
            try? FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
            let filename=String(format:"%03d.png",frame)
            try? data.write(to:folder.appendingPathComponent(filename))
            let record:[String:Any]=["frame":frame,"file":filename,"x":panel.frame.minX,"y":panel.frame.minY,"width":panel.frame.width,"height":panel.frame.height,"time":value["time"] ?? 0,"plant":value["plant"] ?? NSNull(),"dockY":currentScreen().visibleFrame.minY,"floorOffset":floorOffset,"attachedToDock":attachedToDock]
            if let json=try? JSONSerialization.data(withJSONObject:record) {
                try? json.write(to:folder.appendingPathComponent(String(format:"%03d.json",frame)))
            }
            if frame==36 { log("capture complete: \(folder.path)") }
            return
        }
        if type=="step" {
            guard let dx=obj["value"] as? Double,dx.isFinite,abs(dx)<Double(panel.frame.width)*0.5,
                  !paused && !sleeping && !dragging && (actionMoving || roaming && wasMoving && Date()>=waitUntil) else { return }
            let area=currentScreen().visibleFrame,f=panel.frame
            // NSWindow snaps its origin to pixels. Preserve the fractional
            // remainder instead of losing it on every animation frame.
            var x=(preciseX ?? f.minX)+CGFloat(dx)
            if x<area.minX { x=area.minX;direction=1;sendState(moving:!activityBusy) }
            if x+f.width>area.maxX { x=area.maxX-f.width;direction = -1;sendState(moving:!activityBusy) }
            preciseX=x
            panel.setFrameOrigin(NSPoint(x:x,y:f.minY))
            if ProcessInfo.processInfo.arguments.contains("--qa") {
                let now=Date()
                if var sample=motionQA,now.timeIntervalSince(sample.last)<0.2 {
                    sample.distance+=abs(panel.frame.minX-f.minX);sample.frames+=1;sample.last=now
                    let elapsed=now.timeIntervalSince(sample.start)
                    if elapsed>=1.5 {
                        log("motionQA: \(sample.distance/elapsed) points/s, \(Double(sample.frames)/elapsed) frames/s")
                        motionQA=nil
                    } else { motionQA=sample }
                } else { motionQA=(now,now,0,0) }
            }
            return
        }
        log("\(type): \(obj["value"] ?? "")")
        if type=="activity",let value=obj["value"] as? [String:Any],let busy=value["busy"] as? Bool {
            let previous=activityBusy;activityBusy=busy;activityName=busy ? value["kind"] as? String:nil
            if busy {
                wasMoving=false;walkUntil=Date.distantPast;sendState(moving:false)
            } else if previous {
                waitUntil=Date().addingTimeInterval(Double.random(in:1.5...3))
                nextActionAt=Date().addingTimeInterval(Double.random(in:18...35))
            }
            refreshMenu()
        }
        if type=="sound" { playChirp() }
        if type=="ready" {
            ready=true
            loadAnimationLibrary("behaviors")
            loadBird()
        }
        if type=="loaded" {
            previousState=""; sendState(moving:false)
            if ProcessInfo.processInfo.arguments.contains("--qa") { js("window.petQA(false)") }
            if ProcessInfo.processInfo.arguments.contains("--preview-actions") { js("window.petPreviewActions()") }
            if ProcessInfo.processInfo.arguments.contains("--quality-compare") { js("window.petQualityComparison()") }
            if let action=ProcessInfo.processInfo.arguments.first(where:{$0.hasPrefix("--do-action=")}) {
                doAction(action.replacingOccurrences(of:"--do-action=",with:""))
            }
            if let capture=ProcessInfo.processInfo.arguments.first(where:{$0.hasPrefix("--capture-action=")}),!captureStarted {
                captureStarted=true;direction=1
                let area=currentScreen().visibleFrame
                panel.setFrameOrigin(NSPoint(x:area.minX+20,y:panel.frame.minY));preciseX=nil
                doAction(capture.replacingOccurrences(of:"--capture-action=",with:""));js("window.petCapture(36)")
            }
            if ProcessInfo.processInfo.arguments.contains("--no-fur") { js("window.petFurEnabled(false)") }
            if ProcessInfo.processInfo.arguments.contains("--snapshot") {
                DispatchQueue.main.asyncAfter(deadline:.now()+2) { self.snapshot() }
            }
            if ProcessInfo.processInfo.arguments.contains("--capture-walk") && !captureStarted {
                captureStarted=true
                let area=currentScreen().visibleFrame
                panel.setFrameOrigin(NSPoint(x:area.minX+20,y:area.minY+8))
                direction=1;waitUntil=Date();walkUntil=Date().addingTimeInterval(8);wasMoving=true
                previousState="";sendState(moving:true);js("window.petCapture(36)")
            }
        }
    }
    func js(_ script: String) {
        guard ready else { return }
        web.evaluateJavaScript(script+";void(0)") { _,error in if let error { log("js: \(error)") } }
    }
    func loadBird() {
        guard let url=Bundle.main.url(forResource:selected,withExtension:"glb"), let data=try? Data(contentsOf:url) else {
            log("Missing model: \(selected)"); return
        }
        js("window.loadPet('\(data.base64EncodedString())')")
    }
    func loadAnimationLibrary(_ key:String) {
        guard let url=Bundle.main.url(forResource:key,withExtension:"glb"),let data=try? Data(contentsOf:url) else {
            log("Missing animation library: \(key)");js("window.petLibraryFailed('\(key)')");return
        }
        js("window.loadActions('\(data.base64EncodedString())','\(key)')")
    }
    func sendState(moving: Bool) {
        let state="\(moving),\(direction),\(paused || sleeping)"
        if previousState != state { previousState=state; js("window.petState(\(state))") }
    }
    @objc func tick() {
        let now=Date(); lastTick=now
        let p=NSEvent.mouseLocation; let f=panel.frame
        let dx=(p.x-f.midX)/(f.width*0.38), dy=(p.y-(f.minY+f.height*0.45))/(f.height*0.46)
        panel.ignoresMouseEvents = !dragging && (dx*dx+dy*dy>1 || p.y<f.minY+floorOffset-2)
        if attachedToDock && !dragging { alignToDock() }
        guard !paused && !sleeping && !dragging && !activityBusy else { sendState(moving:false); return }
        if autonomous && now>=nextActionAt && !wasMoving && !ProcessInfo.processInfo.arguments.contains("--preview-actions") {
            var options=["chirp","chirp","chirp","peck","peck","preen","preen","look","sit","lie","sleep","trick"]
            if roaming { options += ["hop","run"] }
            doAction(options.randomElement()!,automatic:true);return
        }
        guard roaming else { sendState(moving:false);return }
        var moving=false
        if now>=waitUntil {
            if now>=walkUntil {
                if wasMoving {
                    waitUntil=now.addingTimeInterval(Double.random(in:1.5...4)); wasMoving=false
                    savePosition(); sendState(moving:false); return
                }
                direction=Bool.random() ? 1 : -1
                walkUntil=now.addingTimeInterval(Double.random(in:3...6))
            }
            moving=true;wasMoving=true
            // Each rendered animation frame supplies its matching desktop step.
            // AppKit no longer advances the window on a separate animation clock.
        }
        sendState(moving:moving)
    }
    func currentScreen() -> NSScreen {
        NSScreen.screens.first { $0.frame.contains(NSPoint(x:panel.frame.midX,y:panel.frame.midY)) } ?? NSScreen.main ?? NSScreen.screens[0]
    }
    func clampToScreen() {
        lastDockTarget=nil;lastDockY=nil
        let old=panel.frame.origin
        let point=PetPlacement.clamp(frame:panel.frame,visible:currentScreen().visibleFrame,floorOffset:floorOffset,attached:attachedToDock)
        if abs(point.x-old.x)>0.05 { preciseX=nil }
        if abs(point.x-old.x)>0.05 || abs(point.y-old.y)>0.05 { panel.setFrameOrigin(point) }
    }
    func alignToDock() {
        let target=currentScreen().visibleFrame.minY-floorOffset
        if let oldTarget=lastDockTarget,let oldY=lastDockY,abs(target-oldTarget)<0.05,abs(panel.frame.minY-oldY)<0.05 { return }
        panel.setFrameOrigin(NSPoint(x:panel.frame.minX,y:target));lastDockTarget=target;lastDockY=panel.frame.minY
    }
    func savePosition() { let d=UserDefaults.standard;d.set(panel.frame.minX,forKey:"x");d.set(panel.frame.minY,forKey:"y");d.set(attachedToDock,forKey:"attachedToDock") }
    func react(_ kind: String) { waitUntil=Date().addingTimeInterval(kind=="pet" ? 0.9:3);wasMoving=false;sendState(moving:false);js("window.petReact('\(kind)')") }
    func doAction(_ kind:String,automatic:Bool=false) {
        activityBusy=true;activityName=kind;wasMoving=false;walkUntil=Date.distantPast
        sendState(moving:false);js("window.petDo('\(kind)',\(automatic))");refreshMenu()
    }
    func playChirp() {
        guard soundsEnabled && !paused && !sleeping else { return }
        let prefix=selected=="chick" ? "chicken_chick":"chicken_idle_hen"
        let name=String(format:"%@_%02d",prefix,Int.random(in:1...6))
        guard let url=Bundle.main.url(forResource:name,withExtension:"wav",subdirectory:"Sounds"),let sound=NSSound(contentsOf:url,byReference:true) else { log("Missing sound \(name)");return }
        activeSound?.stop();activeSound=sound;sound.volume=0.10
        log("sound playback \(name): \(sound.play())")
    }
    func item(_ title: String,_ action:Selector, tag:Int=0, checked:Bool=false) -> NSMenuItem {
        let i=NSMenuItem(title:title,action:action,keyEquivalent:"");i.target=self;i.tag=tag;i.state=checked ? .on:.off;return i
    }
    func makeMenu() -> NSMenu {
        let m=NSMenu();let title=NSMenuItem(title:"CS2 Pet",action:nil,keyEquivalent:"");m.addItem(title)
        let choose=NSMenuItem(title:"Pet",action:nil,keyEquivalent:"");let submenu=NSMenu()
        for (idx,bird) in birds.enumerated() { submenu.addItem(item(bird.1,#selector(chooseBird(_:)),tag:idx,checked:selected==bird.0)) }
        choose.submenu=submenu;m.addItem(choose)
        let actionItem=NSMenuItem(title:"Actions",action:nil,keyEquivalent:"");let actionMenu=NSMenu()
        for (title,kind) in [("Sit","sit"),("Lie down","lie"),("Sleep","sleep"),("Preen","preen"),("Peck","peck"),("Chirp","chirp"),("Preen while sitting","groom"),("Look around","look"),("Hop","hop"),("Run","run"),("Run with wings out","runflap")] {
            let i=item(title,#selector(performActivity(_:)));i.representedObject=kind;actionMenu.addItem(i)
        }
        actionMenu.addItem(.separator())
        let tricks=NSMenuItem(title:"Game tricks",action:nil,keyEquivalent:"");let trickMenu=NSMenu()
        for number in 1...13 {
            let i=item("Trick \(number)",#selector(performActivity(_:)));i.representedObject="trick:\(number)";trickMenu.addItem(i)
        }
        tricks.submenu=trickMenu;actionMenu.addItem(tricks)
        let random=item("Random trick",#selector(performActivity(_:)));random.representedObject="trick";actionMenu.addItem(random)
        actionMenu.addItem(.separator())
        let all=NSMenuItem(title:"All animations (\(animationCatalog.count))",action:nil,keyEquivalent:"");let allMenu=NSMenu()
        for group in ["Behaviours","Reactions","Movement","Rest","In water","Tricks","Game scenes","Photo poses","Held"] {
            let heading=NSMenuItem(title:group,action:nil,keyEquivalent:"");let entries=NSMenu()
            for entry in animationCatalog.filter({$0.group==group}) {
                let i=item(entry.label,#selector(performActivity(_:)));i.representedObject="clip:"+entry.name;i.toolTip=entry.name;entries.addItem(i)
            }
            heading.submenu=entries;allMenu.addItem(heading)
        }
        all.submenu=allMenu;actionMenu.addItem(all)
        actionItem.submenu=actionMenu;m.addItem(actionItem)
        m.addItem(item("Stand up / wake up",#selector(wakePet)))
        m.addItem(item("Feed",#selector(feed)));m.addItem(item("Trick",#selector(hop)))
        m.addItem(.separator())
        m.addItem(item("Autonomous actions",#selector(toggleAutonomous),checked:autonomous))
        m.addItem(item("Sounds",#selector(toggleSounds),checked:soundsEnabled))
        m.addItem(item("Roam",#selector(toggleRoaming),checked:roaming))
        m.addItem(item("Pause",#selector(togglePause),checked:paused))
        m.addItem(item("Always on top",#selector(toggleTop),checked:top))
        let sizes=NSMenuItem(title:"Size",action:nil,keyEquivalent:"");let sm=NSMenu()
        for (name,value) in [("Small",150),("Medium",210),("Large",290)] { sm.addItem(item(name,#selector(resize(_:)),tag:value,checked:Int(size)==value)) }
        sizes.submenu=sm;m.addItem(sizes)
        m.addItem(item("Place on Dock",#selector(resetPosition)))
        m.addItem(.separator());m.addItem(item("Quit CS2 Pet",#selector(quit)))
        return m
    }
    func refreshMenu() {
        status.menu=makeMenu();status.button?.title=selected=="chick" ? "🐥":"🐔"
        var names=["sit":"sitting","lie":"lying down","sleep":"sleeping","preen":"preening","peck":"pecking","chirp":"chirping","groom":"preening while sitting","look":"looking around","hop":"hopping","run":"running","runflap":"running with wings out"]
        for entry in animationCatalog { names["clip:"+entry.name]=entry.label }
        status.button?.toolTip=activityName.map { "CS2 Pet — \(names[$0] ?? "performing a trick")" } ?? "CS2 Pet — desktop companion"
    }
    @objc func chooseBird(_ sender:NSMenuItem) { selected=birds[sender.tag].0;UserDefaults.standard.set(selected,forKey:"bird");activityBusy=false;nextActionAt=Date().addingTimeInterval(12);loadBird();refreshMenu() }
    @objc func feed() { doAction("peck") }
    @objc func hop() { doAction("trick") }
    @objc func performActivity(_ sender:NSMenuItem) { if let kind=sender.representedObject as? String { doAction(kind) } }
    @objc func wakePet() { js("window.petDo('wake')") }
    @objc func toggleAutonomous() { autonomous.toggle();UserDefaults.standard.set(!autonomous,forKey:"noAutonomous");nextActionAt=Date().addingTimeInterval(Double.random(in:8...15));refreshMenu() }
    @objc func toggleSounds() { soundsEnabled.toggle();UserDefaults.standard.set(!soundsEnabled,forKey:"muted");if !soundsEnabled { activeSound?.stop() };refreshMenu() }
    @objc func toggleRoaming() { roaming.toggle();UserDefaults.standard.set(!roaming,forKey:"stay");refreshMenu() }
    @objc func togglePause() { paused.toggle();UserDefaults.standard.set(paused,forKey:"paused");if paused { activeSound?.stop() };refreshMenu() }
    @objc func toggleTop() { top.toggle();UserDefaults.standard.set(!top,forKey:"desktopLevel");panel.level=top ? .floating:NSWindow.Level(rawValue:Int(CGWindowLevelForKey(.desktopIconWindow))+1);refreshMenu() }
    @objc func resize(_ sender:NSMenuItem) { size=CGFloat(sender.tag);UserDefaults.standard.set(Double(size),forKey:"size");panel.setContentSize(NSSize(width:size,height:size));clampToScreen();js("window.dispatchEvent(new Event('resize'))");refreshMenu() }
    @objc func resetPosition() {
        attachedToDock=true;preciseX=nil
        let area=currentScreen().visibleFrame
        panel.setFrameOrigin(NSPoint(x:area.midX-panel.frame.width/2,y:area.minY-floorOffset))
        clampToScreen();savePosition()
    }
    @objc func quit() { savePosition();NSApp.terminate(nil) }
    @objc func sleepNow() { sleeping=true;activeSound?.stop();sendState(moving:false) }
    @objc func wakeNow() { sleeping=false;lastTick=Date();previousState="" }
    @objc func screenChanged() { clampToScreen() }
    func snapshot() {
        web.takeSnapshot(with:nil) { image,error in
            guard let image,let tiff=image.tiffRepresentation,let rep=NSBitmapImageRep(data:tiff),let png=rep.representation(using:.png,properties:[:]) else { log("snapshot error \(String(describing:error))");return }
            try? png.write(to:URL(fileURLWithPath:"/tmp/cs2-pet-\(self.selected).png"));log("snapshot saved")
        }
    }
}

final class AppDelegate:NSObject,NSApplicationDelegate {
    var pet:PetController?
    func applicationDidFinishLaunching(_ notification:Notification) { pet=PetController() }
    func applicationWillTerminate(_ notification:Notification) { pet?.savePosition() }
}
let app=NSApplication.shared
if NSRunningApplication.runningApplications(withBundleIdentifier:"local.maxime.cs2pet").count>1 { exit(0) }
app.setActivationPolicy(.accessory)
let delegate=AppDelegate();app.delegate=delegate;app.run()
