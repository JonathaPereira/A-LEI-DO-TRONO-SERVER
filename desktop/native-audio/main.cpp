// Windows application loopback. API reference:
// https://learn.microsoft.com/windows/win32/coreaudio/application-loopback
// Capture includes only the selected process tree, never the system mix.
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <wrl.h>
#include <wrl/implements.h>
#include <avrt.h>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>
#include <cmath>
#include "activity.h"
using namespace Microsoft::WRL;
class Activation final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase, IActivateAudioInterfaceCompletionHandler> {
public:
    HANDLE event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    HRESULT result = E_PENDING;
    ComPtr<IAudioClient> client;
    ~Activation() { if(event) CloseHandle(event); }
    STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* operation) override {
        ComPtr<IUnknown> unknown;
        HRESULT activated = E_UNEXPECTED;
        result = operation->GetActivateResult(&activated, &unknown);
        if(SUCCEEDED(result)) result = activated;
        if(SUCCEEDED(result)) result = unknown.As(&client);
        SetEvent(event);
        return S_OK;
    }
};
static DWORD buildNumber() {
    struct Version { ULONG size, major, minor, build, platform; WCHAR servicePack[128]; } version{};
    version.size = sizeof(version);
    auto get = reinterpret_cast<LONG(WINAPI*)(Version*)>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlGetVersion"));
    return get && get(&version) == 0 ? version.build : 0;
}
static void check(HRESULT hr) { if(FAILED(hr)) throw hr; }
static bool writeAll(HANDLE output, const void* bytes, DWORD size) {
    auto cursor = static_cast<const BYTE*>(bytes);
    while(size) { DWORD written = 0; if(!WriteFile(output,cursor,size,&written,nullptr) || !written) return false; cursor+=written; size-=written; }
    return true;
}
static bool stopping() {
    DWORD available=0;
    if(!PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE),nullptr,0,nullptr,&available,nullptr)) return GetLastError()==ERROR_BROKEN_PIPE;
    if(!available) return false;
    char command=0; DWORD read=0; ReadFile(GetStdHandle(STD_INPUT_HANDLE),&command,1,&read,nullptr);
    return command=='q';
}
// Test-only command-line source: two separate instances let the Windows test
// verify that application loopback includes one tone and excludes the other.
static int tone(double frequency) {
    check(CoInitializeEx(nullptr,COINIT_MULTITHREADED));
    ComPtr<IMMDeviceEnumerator> devices;check(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&devices)));
    ComPtr<IMMDevice> device;check(devices->GetDefaultAudioEndpoint(eRender,eMultimedia,&device));
    ComPtr<IAudioClient> client;check(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,&client));
    WAVEFORMATEX format{};format.wFormatTag=WAVE_FORMAT_PCM;format.nChannels=2;format.nSamplesPerSec=44100;format.wBitsPerSample=16;format.nBlockAlign=4;format.nAvgBytesPerSec=176400;
    check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,1000000,0,&format,nullptr));
    ComPtr<IAudioRenderClient> render;check(client->GetService(IID_PPV_ARGS(&render)));UINT32 total=0;check(client->GetBufferSize(&total));
    check(client->Start());std::cerr << "{\"type\":\"tone-ready\"}" << std::endl;uint64_t position=0;
    while(!stopping()) {
        UINT32 padding=0;check(client->GetCurrentPadding(&padding));UINT32 frames=total-padding;
        if(frames){BYTE* data=nullptr;check(render->GetBuffer(frames,&data));auto pcm=reinterpret_cast<int16_t*>(data);
            for(UINT32 i=0;i<frames;i++){auto value=static_cast<int16_t>(std::sin(6.283185307179586*frequency*(position++)/44100)*5000);pcm[2*i]=value;pcm[2*i+1]=value;}
            check(render->ReleaseBuffer(frames,0));
        }
        Sleep(10);
    }
    client->Stop();return 0;
}
int wmain(int argc, wchar_t** argv) {
    if(argc==4 && std::wstring(argv[1])==L"--activity-watch" && std::wstring(argv[2])==L"--exclude-pid"){
        try{return activityWatch(static_cast<DWORD>(std::stoul(argv[3])));}catch(...){return 1;}
    }
    if(argc==2 && std::wstring(argv[1])==L"--probe") {
        std::cout << "{\"available\":" << (buildNumber()>=20348?"true":"false") << ",\"build\":" << buildNumber() << "}";
        return 0;
    }
    DWORD processId=0,excluded=0;
    try {
        if(argc==3 && std::wstring(argv[1])==L"--test-tone") { double frequency=std::stod(argv[2]);if(frequency<100 || frequency>3000)throw E_INVALIDARG;return tone(frequency); }
        for(int i=1;i+1<argc;i+=2) {
            std::wstring key=argv[i],value=argv[i+1]; size_t used=0; auto number=std::stoull(value,&used);
            if(used!=value.size() || !number) throw E_INVALIDARG;
            if(key==L"--window") { if(!IsWindow(reinterpret_cast<HWND>(static_cast<uintptr_t>(number)))) throw E_INVALIDARG; GetWindowThreadProcessId(reinterpret_cast<HWND>(static_cast<uintptr_t>(number)),&processId); }
            else if(key==L"--pid") { if(number>MAXDWORD) throw E_INVALIDARG; processId=static_cast<DWORD>(number); }
            else if(key==L"--exclude-pid") { if(number>MAXDWORD) throw E_INVALIDARG; excluded=static_cast<DWORD>(number); }
            else throw E_INVALIDARG;
        }
        if(!processId || processId==excluded || buildNumber()<20348) throw E_NOTIMPL;
        check(CoInitializeEx(nullptr,COINIT_MULTITHREADED));
        auto activation=Make<Activation>();
        AUDIOCLIENT_ACTIVATION_PARAMS parameters{};
        parameters.ActivationType=AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
        parameters.ProcessLoopbackParams.TargetProcessId=processId;
        parameters.ProcessLoopbackParams.ProcessLoopbackMode=PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
        PROPVARIANT variant{};variant.vt=VT_BLOB;variant.blob.cbSize=sizeof(parameters);variant.blob.pBlobData=reinterpret_cast<BYTE*>(&parameters);
        ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
        check(ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,__uuidof(IAudioClient),&variant,activation.Get(),&operation));
        if(WaitForSingleObject(activation->event,15000)!=WAIT_OBJECT_0) throw HRESULT_FROM_WIN32(WAIT_TIMEOUT);
        check(activation->result);
        WAVEFORMATEX format{};
        format.wFormatTag=WAVE_FORMAT_PCM;format.nChannels=2;format.nSamplesPerSec=44100;format.wBitsPerSample=16;
        format.nBlockAlign=4;format.nAvgBytesPerSec=176400;
        check(activation->client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_LOOPBACK|AUDCLNT_STREAMFLAGS_EVENTCALLBACK|AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,0,0,&format,nullptr));
        ComPtr<IAudioCaptureClient> capture;
        check(activation->client->GetService(IID_PPV_ARGS(&capture)));
        HANDLE event=CreateEventW(nullptr,FALSE,FALSE,nullptr);
        if(!event) throw HRESULT_FROM_WIN32(GetLastError());
        check(activation->client->SetEventHandle(event));check(activation->client->Start());
        DWORD task=0;HANDLE priority=AvSetMmThreadCharacteristicsW(L"Audio",&task);
        std::cerr << "{\"type\":\"ready\",\"sampleRate\":44100,\"channels\":2,\"pid\":" << processId << "}" << std::endl;
        HANDLE output=GetStdHandle(STD_OUTPUT_HANDLE);
        bool running=true;
        while(running && !stopping()) {
            if(WaitForSingleObject(event,100)!=WAIT_OBJECT_0) continue;
            UINT32 packet=0;check(capture->GetNextPacketSize(&packet));
            while(packet && running) {
                BYTE* data=nullptr;UINT32 frames=0;DWORD flags=0;
                check(capture->GetBuffer(&data,&frames,&flags,nullptr,nullptr));
                uint32_t bytes=frames*format.nBlockAlign;
                std::vector<BYTE> silence;
                if(flags&AUDCLNT_BUFFERFLAGS_SILENT) { silence.resize(bytes);data=silence.data(); }
                running=writeAll(output,&bytes,sizeof(bytes)) && writeAll(output,data,bytes);
                check(capture->ReleaseBuffer(frames));check(capture->GetNextPacketSize(&packet));
            }
        }
        activation->client->Stop();if(priority)AvRevertMmThreadCharacteristics(priority);CloseHandle(event);
        return 0;
    } catch(HRESULT hr) {
        std::cerr << "{\"type\":\"error\",\"code\":" << static_cast<uint32_t>(hr) << "}" << std::endl;
        return 1;
    } catch(...) { std::cerr << "{\"type\":\"error\",\"code\":0}" << std::endl;return 1; }
}
