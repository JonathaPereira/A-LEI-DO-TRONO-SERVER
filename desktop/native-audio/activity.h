#pragma once
#include <tlhelp32.h>
#include <unordered_set>
#include <unordered_map>
#include <algorithm>
// Names come from executable metadata. Window captions are never read.
inline std::string activityUtf8(const std::wstring& value){
    if(value.empty())return "";int n=WideCharToMultiByte(CP_UTF8,0,value.data(),static_cast<int>(value.size()),nullptr,0,nullptr,nullptr);
    std::string out(n,0);WideCharToMultiByte(CP_UTF8,0,value.data(),static_cast<int>(value.size()),out.data(),n,nullptr,nullptr);return out;
}
inline std::string activityJson(const std::wstring& value){
    std::string out="\"";for(unsigned char c:activityUtf8(value)){if(c=='"'||c=='\\'){out+='\\';out+=c;}else if(c>=32)out+=c;}return out+'"';
}
inline std::wstring activityProduct(const std::wstring& path){
    DWORD ignored=0,size=GetFileVersionInfoSizeW(path.c_str(),&ignored);if(!size||size>1048576)return L"";
    std::vector<BYTE> data(size);if(!GetFileVersionInfoW(path.c_str(),0,size,data.data()))return L"";
    struct Translation{WORD language,codepage;};Translation* translations=nullptr;UINT length=0;
    if(!VerQueryValueW(data.data(),L"\\VarFileInfo\\Translation",reinterpret_cast<void**>(&translations),&length)||length<sizeof(Translation))return L"";
    wchar_t query[128];swprintf_s(query,L"\\StringFileInfo\\%04x%04x\\ProductName",translations[0].language,translations[0].codepage);
    wchar_t* text=nullptr;UINT count=0;if(VerQueryValueW(data.data(),query,reinterpret_cast<void**>(&text),&count)&&text&&count>1&&count<256)return std::wstring(text,count-1);return L"";
}
inline int activityWatch(DWORD excluded){
    std::string command;std::unordered_map<std::wstring,std::wstring> products;
    while(std::getline(std::cin,command)){
        if(command!="scan")continue;
        std::unordered_set<DWORD> visible;
        EnumWindows([](HWND hwnd,LPARAM value)->BOOL{DWORD pid=0;if(IsWindowVisible(hwnd)&&GetWindow(hwnd,GW_OWNER)==nullptr){GetWindowThreadProcessId(hwnd,&pid);if(pid)reinterpret_cast<std::unordered_set<DWORD>*>(value)->insert(pid);}return TRUE;},reinterpret_cast<LPARAM>(&visible));
        DWORD foreground=0;GetWindowThreadProcessId(GetForegroundWindow(),&foreground);
        HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);if(snapshot==INVALID_HANDLE_VALUE){std::cout<<"{\"type\":\"apps\",\"apps\":[]}"<<std::endl;continue;}
        PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);bool first=true;unsigned count=0;
        std::cout<<"{\"type\":\"apps\",\"apps\":[";
        if(Process32FirstW(snapshot,&entry))do{
            if(entry.th32ProcessID==excluded||!visible.count(entry.th32ProcessID)||count>=128)continue;
            HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,entry.th32ProcessID);
            std::wstring path(32768,0);DWORD size=static_cast<DWORD>(path.size());BOOL ok=process?QueryFullProcessImageNameW(process,0,path.data(),&size):FALSE;if(process)CloseHandle(process);
            if(ok&&size<=16384)path.resize(size);else path=L"process:"+std::wstring(entry.szExeFile);
            if(!products.count(path)){if(products.size()>=256)products.clear();products[path]=activityProduct(path);}
            if(!first)std::cout<<",";first=false;count++;
            std::cout<<"{\"pid\":"<<entry.th32ProcessID<<",\"exe\":"<<activityJson(entry.szExeFile)<<",\"path\":"<<activityJson(path)<<",\"product\":"<<activityJson(products[path])<<",\"foreground\":"<<(entry.th32ProcessID==foreground?"true":"false")<<"}";
        }while(Process32NextW(snapshot,&entry));
        CloseHandle(snapshot);std::cout<<"]}"<<std::endl;
    }return 0;
}
