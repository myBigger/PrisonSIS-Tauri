QT += quick qml graphicaleffects

CONFIG += c++17

# Qt 6: use CMakeLists.txt style QT_ENABLE_*
QT_ENABLE_EGLDEVICE_BACKEND = 1

SOURCES += \
    main.cpp

RESOURCES += \
    qml.qrc

# Additional import path for Qt Quick Controls
QML_IMPORT_PATH += $$PWD/qml
QML_DESIGNER_IMPORT_PATH +=

# Qt Quick Compiler for performance
CONFIG += qmltc

# Default rules for deployment
qnx: target.path = /tmp/$${TARGET}/bin
else: unix:!android: target.path = /opt/$${TARGET}/bin
!isEmpty(target.path): INSTALLS += target

HEADERS +=
