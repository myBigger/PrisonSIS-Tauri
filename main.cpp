#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QSvgIcon>
#include <QFont>

int main(int argc, char* argv[])
{
    QGuiApplication app(argc, argv);

    app.setApplicationName("PrisonSIS");
    app.setApplicationVersion("1.0.0");
    app.setOrganizationName("PrisonSIS");

    // 全局字体
    QFont defaultFont = QFont("Inter, 'SF Pro Display', 'Segoe UI', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif");
    defaultFont.setPointSizeF(13);
    app.setFont(defaultFont);

    // 使用 Qt Quick Controls 2 Material 风格作为基础，再覆盖为自定义
    QQuickStyle::setStyle("Material");

    QQmlApplicationEngine engine;

    // 注册全局对象
    engine.rootContext()->setContextProperty("appVersion", "1.0.0");

    const QUrl url(QStringLiteral("qrc:/qml/Main.qml"));
    QObject::connect(
        &engine, &QQmlApplicationEngine::objectCreated,
        &app, [url](QObject* obj, const QUrl& objUrl) {
            if (!obj && url == objUrl)
                QCoreApplication::exit(EXIT_FAILURE);
        },
        Qt::QueuedConnection);

    engine.load(url);

    return app.exec();
}
