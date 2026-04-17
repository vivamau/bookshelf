import SwiftUI
import SwiftData

struct SettingsView: View {
    @Query private var localBooks: [LocalBook]
    @Query(sort: \ServerConfig.dateAdded) private var servers: [ServerConfig]
    @Environment(\.modelContext) private var modelContext
    @AppStorage("defaultFontSize") private var defaultFontSize: Double = 18
    @AppStorage("defaultFontFamily") private var defaultFontFamily: String = "Georgia"
    @AppStorage("defaultTheme") private var defaultTheme: String = "light"
    @State private var showingAddServer = false
    @State private var serverToEdit: ServerConfig?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                serversSection
                readingSection
                storageSection
                aboutSection
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
        }
        .scrollContentBackground(.hidden)
        .bookshelfBackground()
        .navigationTitle("Settings")
        .bookshelfNavBar()
        .sheet(isPresented: $showingAddServer) { AddServerView() }
        .sheet(item: $serverToEdit) { EditServerView(server: $0) }
    }

    // MARK: - Servers

    private var serversSection: some View {
        settingsCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionTitle("Servers")

                ForEach(servers) { server in
                    serverEntry(server)
                    if server.id != servers.last?.id {
                        Divider().background(BookshelfTheme.border).padding(.leading, 56)
                    }
                }

                if !servers.isEmpty {
                    Divider().background(BookshelfTheme.border)
                }

                Button {
                    showingAddServer = true
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(BookshelfTheme.accent)
                        Text("Add Server")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(BookshelfTheme.accent)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 13)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func serverEntry(_ server: ServerConfig) -> some View {
        HStack(spacing: 12) {
            Image(systemName: server.type == .bookshelf ? "books.vertical.fill" : "antenna.radiowaves.left.and.right")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(server.type == .bookshelf ? BookshelfTheme.accent : Color.orange)
                .frame(width: 36, height: 36)
                .background(
                    (server.type == .bookshelf ? BookshelfTheme.accent : Color.orange).opacity(0.12)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(server.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Text(server.baseURL)
                    .font(.system(size: 11))
                    .foregroundStyle(BookshelfTheme.mutedText)
                    .lineLimit(1)
            }

            Spacer()

            Button { serverToEdit = server } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 13))
                    .foregroundStyle(BookshelfTheme.dimText)
                    .frame(width: 30, height: 30)
                    .background(BookshelfTheme.surfaceRaised)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button("Delete", role: .destructive) {
                modelContext.delete(server)
                try? modelContext.save()
            }
            Button("Edit") { serverToEdit = server }
                .tint(BookshelfTheme.accent)
        }
    }

    // MARK: - Reading

    private var readingSection: some View {
        settingsCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionTitle("Reading Defaults")

                settingsRow(label: "Font") {
                    Picker("", selection: $defaultFontFamily) {
                        Text("System").tag("system-ui")
                        Text("Georgia").tag("Georgia")
                        Text("Palatino").tag("Palatino")
                        Text("Charter").tag("Charter")
                        Text("Iowan Old Style").tag("Iowan Old Style")
                    }
                    .labelsHidden()
                    .tint(BookshelfTheme.accent)
                }

                Divider().background(BookshelfTheme.border).padding(.leading, 16)

                settingsRow(label: "Font Size (\(Int(defaultFontSize))pt)") {
                    Slider(value: $defaultFontSize, in: 12...32, step: 1)
                        .tint(BookshelfTheme.accent)
                        .frame(maxWidth: 150)
                }

                Divider().background(BookshelfTheme.border).padding(.leading, 16)

                settingsRow(label: "Theme") {
                    Picker("", selection: $defaultTheme) {
                        Text("Light").tag("light")
                        Text("Sepia").tag("sepia")
                        Text("Dark").tag("dark")
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(maxWidth: 180)
                }
            }
        }
    }

    // MARK: - Storage

    private var storageSection: some View {
        settingsCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionTitle("Storage")

                settingsRow(label: "Downloaded Books") {
                    Text("\(localBooks.count)")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(BookshelfTheme.accent)
                }

                Divider().background(BookshelfTheme.border).padding(.leading, 16)

                settingsRow(label: "Total Size") {
                    Text(totalStorageSize)
                        .font(.system(size: 14))
                        .foregroundStyle(BookshelfTheme.mutedText)
                }
            }
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        settingsCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionTitle("About")

                settingsRow(label: "Version") {
                    Text("1.0.0").font(.system(size: 14)).foregroundStyle(BookshelfTheme.mutedText)
                }
                Divider().background(BookshelfTheme.border).padding(.leading, 16)
                settingsRow(label: "OPDS Support") {
                    Text("OPDS 1.2").font(.system(size: 14)).foregroundStyle(BookshelfTheme.mutedText)
                }
                Divider().background(BookshelfTheme.border).padding(.leading, 16)
                settingsRow(label: "Formats") {
                    Text("EPUB · PDF").font(.system(size: 14)).foregroundStyle(BookshelfTheme.mutedText)
                }
            }
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func settingsCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .background(BookshelfTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(BookshelfTheme.border, lineWidth: 1)
        )
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(BookshelfTheme.mutedText)
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)
    }

    @ViewBuilder
    private func settingsRow<Trailing: View>(label: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(.white)
            Spacer()
            trailing()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var totalStorageSize: String {
        let total = localBooks.reduce(Int64(0)) { $0 + $1.fileSize }
        return ByteCountFormatter.string(fromByteCount: total, countStyle: .file)
    }
}
