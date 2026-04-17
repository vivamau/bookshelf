import SwiftUI
import SwiftData

struct AddServerView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var baseURL = ""
    @State private var serverType: ServerType = .opds
    @State private var username = ""
    @State private var password = ""
    @State private var isTesting = false
    @State private var testResult: TestResult?

    enum TestResult {
        case success(String)
        case failure(String)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    formCard {
                        VStack(alignment: .leading, spacing: 0) {
                            cardSectionTitle("Server Details")

                            darkTextField("Name", text: $name, placeholder: "My Library")
                            cardDivider()

                            // Type picker
                            HStack {
                                Text("Type")
                                    .font(.system(size: 14))
                                    .foregroundStyle(.white)
                                Spacer()
                                Picker("", selection: $serverType) {
                                    ForEach(ServerType.allCases, id: \.self) {
                                        Text($0.displayName).tag($0)
                                    }
                                }
                                .labelsHidden()
                                .tint(BookshelfTheme.accent)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)

                            cardDivider()
                            darkTextField("URL", text: $baseURL, placeholder: urlPlaceholder)
                                #if !os(macOS)
                                .keyboardType(.URL)
                                .autocapitalization(.none)
                                #endif

                            Text(urlHelpText)
                                .font(.system(size: 11))
                                .foregroundStyle(BookshelfTheme.dimText)
                                .padding(.horizontal, 16)
                                .padding(.bottom, 12)
                        }
                    }

                    formCard {
                        VStack(alignment: .leading, spacing: 0) {
                            cardSectionTitle("Authentication")

                            darkTextField("Username", text: $username, placeholder: "Username")
                                #if !os(macOS)
                                .autocapitalization(.none)
                                #endif
                            cardDivider()
                            darkSecureField("Password", text: $password)

                            Text(authHelpText)
                                .font(.system(size: 11))
                                .foregroundStyle(BookshelfTheme.dimText)
                                .padding(.horizontal, 16)
                                .padding(.bottom, 12)
                        }
                    }

                    formCard {
                        VStack(alignment: .leading, spacing: 0) {
                            cardSectionTitle("Connection")

                            Button {
                                Task { await testConnection() }
                            } label: {
                                HStack(spacing: 10) {
                                    if isTesting {
                                        ProgressView().controlSize(.small).tint(BookshelfTheme.accent)
                                        Text("Testing…")
                                    } else {
                                        Image(systemName: "antenna.radiowaves.left.and.right")
                                            .foregroundStyle(BookshelfTheme.accent)
                                        Text("Test Connection")
                                    }
                                    Spacer()
                                }
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(BookshelfTheme.accent)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                            }
                            .buttonStyle(.plain)
                            .disabled(baseURL.isEmpty || isTesting)
                            .opacity((baseURL.isEmpty || isTesting) ? 0.4 : 1)

                            if let result = testResult {
                                cardDivider()
                                switch result {
                                case .success(let msg):
                                    resultRow(msg, icon: "checkmark.circle.fill", color: .green)
                                case .failure(let msg):
                                    resultRow(msg, icon: "xmark.circle.fill", color: BookshelfTheme.accent)
                                }
                            }
                        }
                    }

                    if serverType == .bookshelf {
                        formCard {
                            HStack(spacing: 12) {
                                Image(systemName: "info.circle.fill")
                                    .foregroundStyle(BookshelfTheme.accent)
                                    .font(.system(size: 14))
                                Text("Bookshelf servers provide full API access including reading progress, readlists, and reviews, plus OPDS catalog browsing.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(BookshelfTheme.mutedText)
                            }
                            .padding(16)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .scrollContentBackground(.hidden)
            .bookshelfBackground()
            .navigationTitle("Add Server")
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .bookshelfNavBar()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(BookshelfTheme.mutedText)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { addServer() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(name.isEmpty || baseURL.isEmpty ? BookshelfTheme.dimText : BookshelfTheme.accent)
                        .disabled(name.isEmpty || baseURL.isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 440)
        #endif
    }

    // MARK: - Form helpers

    @ViewBuilder
    private func formCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) { content() }
            .background(BookshelfTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(BookshelfTheme.border, lineWidth: 1)
            )
    }

    private func cardSectionTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(BookshelfTheme.mutedText)
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)
    }

    private func cardDivider() -> some View {
        Divider()
            .background(BookshelfTheme.border)
            .padding(.leading, 16)
    }

    private func darkTextField(_ label: String, text: Binding<String>, placeholder: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .frame(minWidth: 80, alignment: .leading)
            TextField(placeholder, text: text)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .tint(BookshelfTheme.accent)
                #if !os(macOS)
                .autocorrectionDisabled()
                #endif
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func darkSecureField(_ label: String, text: Binding<String>) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .frame(minWidth: 80, alignment: .leading)
            SecureField("", text: text)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .tint(BookshelfTheme.accent)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func resultRow(_ msg: String, icon: String, color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .font(.system(size: 14))
            Text(msg)
                .font(.system(size: 12))
                .foregroundStyle(BookshelfTheme.mutedText)
                .lineLimit(3)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - URL / auth helpers (unchanged logic)

    private var urlPlaceholder: String {
        switch serverType {
        case .bookshelf: return "https://myserver.com:3005"
        case .opds:      return "https://myserver.com/opds"
        }
    }

    private var urlHelpText: String {
        switch serverType {
        case .bookshelf:
            return "Enter the base URL of your Bookshelf server (e.g. http://192.168.1.10:3005)."
        case .opds:
            return "Enter the full OPDS catalog root URL (e.g. https://myserver.com/opds)."
        }
    }

    private var authHelpText: String {
        switch serverType {
        case .bookshelf: return "Same credentials you use to log in to the Bookshelf web app."
        case .opds:      return "Credentials for HTTP Basic Auth (leave blank if not required)."
        }
    }

    private func addServer() {
        let server = ServerConfig(
            name: name,
            baseURL: baseURL,
            serverType: serverType,
            username: username,
            password: password,
            iconName: serverType == .bookshelf ? "books.vertical.fill" : "antenna.radiowaves.left.and.right"
        )
        modelContext.insert(server)
        try? modelContext.save()
        dismiss()
    }

    private func testConnection() async {
        isTesting = true
        testResult = nil
        let server = ServerConfig(name: "test", baseURL: baseURL, serverType: serverType, username: username, password: password)
        let client = NetworkClient(server: server)
        do {
            let feed = try await client.fetchOPDSFeed(url: server.opdsRootURL)
            await MainActor.run {
                testResult = .success("Connected! Found \(feed.entries.count) entries in \"\(feed.title)\"")
            }
        } catch {
            await MainActor.run {
                testResult = .failure(error.localizedDescription)
            }
        }
        isTesting = false
    }
}

// MARK: - Edit Server View

struct EditServerView: View {
    @Bindable var server: ServerConfig
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    editCard {
                        VStack(spacing: 0) {
                            cardSectionTitle("Server Details")
                            editRow("Name") { TextField("Name", text: $server.name).tint(BookshelfTheme.accent) }
                            Divider().background(BookshelfTheme.border).padding(.leading, 16)
                            HStack {
                                Text("Type").font(.system(size: 14)).foregroundStyle(.white)
                                Spacer()
                                Picker("", selection: Binding(get: { server.type }, set: { server.type = $0 })) {
                                    ForEach(ServerType.allCases, id: \.self) { Text($0.displayName).tag($0) }
                                }
                                .labelsHidden()
                                .tint(BookshelfTheme.accent)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            Divider().background(BookshelfTheme.border).padding(.leading, 16)
                            editRow("URL") {
                                TextField("URL", text: $server.baseURL)
                                    .tint(BookshelfTheme.accent)
                                    #if !os(macOS)
                                    .keyboardType(.URL)
                                    .autocapitalization(.none)
                                    #endif
                            }
                        }
                    }

                    editCard {
                        VStack(spacing: 0) {
                            cardSectionTitle("Authentication")
                            editRow("Username") {
                                TextField("Username", text: $server.username)
                                    .tint(BookshelfTheme.accent)
                                    #if !os(macOS)
                                    .autocapitalization(.none)
                                    #endif
                            }
                            Divider().background(BookshelfTheme.border).padding(.leading, 16)
                            editRow("Password") {
                                SecureField("Password", text: $server.password)
                                    .tint(BookshelfTheme.accent)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .scrollContentBackground(.hidden)
            .bookshelfBackground()
            .navigationTitle("Edit Server")
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .bookshelfNavBar()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(BookshelfTheme.accent)
                }
            }
        }
        .preferredColorScheme(.dark)
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 360)
        #endif
    }

    @ViewBuilder
    private func editCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) { content() }
            .background(BookshelfTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(BookshelfTheme.border, lineWidth: 1))
    }

    private func cardSectionTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(BookshelfTheme.mutedText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)
    }

    private func editRow<Trailing: View>(_ label: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .frame(minWidth: 80, alignment: .leading)
            trailing()
                .font(.system(size: 14))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}
