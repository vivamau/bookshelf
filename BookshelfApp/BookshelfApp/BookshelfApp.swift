import SwiftUI
import SwiftData

@main
struct BookshelfApp: App {
    let modelContainer: ModelContainer

    init() {
        do {
            let schema = Schema([
                ServerConfig.self,
                LocalBook.self,
                DownloadTask.self
            ])
            let config = ModelConfiguration(isStoredInMemoryOnly: false)
            modelContainer = try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("Could not initialize ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(modelContainer)
        #if os(macOS)
        .defaultSize(width: 1100, height: 750)
        #endif

        #if os(macOS)
        Settings {
            SettingsView()
                .modelContainer(modelContainer)
        }
        #endif
    }
}
