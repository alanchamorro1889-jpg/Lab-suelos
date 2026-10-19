import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView,
  SafeAreaView, Alert, Platform, StatusBar, Image, ActivityIndicator,
  Linking,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';

const C = {
  bg:'#0E1116', card:'#161B23', card2:'#1E2531', border:'#2A3344',
  accent:'#F59E0B', accent2:'#38BDF8', text:'#E8EDF5', muted:'#8FA0B8',
  danger:'#F87171', ok:'#4ADE80', whatsapp:'#25D366',
};

const K_MUESTRAS = '@suelos:muestras';
const K_ENSAYOS  = '@suelos:ensayos';
const K_QUIZ     = '@suelos:quiz';
const K_OPERARIO = '@suelos:operario';
const K_SERVER   = '@suelos:serverUrl';
const K_PIN      = '@suelos:adminPin';
const K_OBRA     = '@suelos:obra';
const K_OBRAS_HIST = '@suelos:obrasHistorial';

const TABS = [
  { id:'inicio',    label:'Inicio',   icon:'🏠' },
  { id:'muestras',  label:'Muestras', icon:'🗂️' },
  { id:'calc',      label:'Ensayos',  icon:'🧮' },
  { id:'preguntas', label:'Quiz',     icon:'❓' },
  { id:'reportes',  label:'Reportes', icon:'📄' },
];

const num = (v) => { const n = parseFloat(String(v).replace(',','.')); return Number.isFinite(n) ? n : NaN; };
const r = (v,d=2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const hoy = () => new Date().toISOString().slice(0,10);

const clasifIP = (ip) => {
  if (!Number.isFinite(ip)) return '—';
  if (ip < 1)  return 'No plástico';
  if (ip < 7)  return 'Ligeramente plástico';
  if (ip < 15) return 'Medianamente plástico';
  return 'Altamente plástico';
};

const regresionCuadratica = (pts) => {
  const n = pts.length;
  if (n < 3) return null;
  let sx=0,sx2=0,sx3=0,sx4=0,sy=0,sxy=0,sx2y=0;
  for (const {x,y} of pts) {
    sx+=x; sx2+=x*x; sx3+=x**3; sx4+=x**4;
    sy+=y; sxy+=x*y; sx2y+=x*x*y;
  }
  const det = (m) =>
    m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) -
    m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) +
    m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  const M = [[sx4,sx3,sx2],[sx3,sx2,sx],[sx2,sx,n]];
  const D = det(M);
  if (Math.abs(D) < 1e-12) return null;
  const A = det([[sx2y,sx3,sx2],[sxy,sx2,sx],[sy,sx,n]]) / D;
  const B = det([[sx4,sx2y,sx2],[sx3,sxy,sx],[sx2,sy,n]]) / D;
  const Cc= det([[sx4,sx3,sx2y],[sx3,sx2,sxy],[sx2,sx,sy]]) / D;
  return { a:A, b:B, c:Cc };
};

const clasificarAASHTO = ({ pasa200, pasa40, pasa10, LL, IP }) => {
  const F200 = Number.isFinite(pasa200) ? pasa200 : null;
  const F40  = Number.isFinite(pasa40)  ? pasa40  : (F200 ?? 0);
  const F10  = Number.isFinite(pasa10)  ? pasa10  : F40;
  const ll   = Number.isFinite(LL) ? LL : 0;
  const ip   = Number.isFinite(IP) ? IP : 0;
  if (F200 === null) return null;

  let grupo = '—', desc = 'Datos insuficientes';

  if (F200 <= 35) {
    if (F40 <= 30 && F10 <= 15 && ip <= 6)      { grupo='A-1-a'; desc='Grava bien gradada'; }
    else if (F40 <= 50 && F10 <= 25 && ip <= 6) { grupo='A-1-b'; desc='Grava pobremente gradada'; }
    else if (F40 <= 10 && ip === 0)             { grupo='A-3';   desc='Arena fina'; }
    else if (ip <= 10 && ll <= 40)              { grupo='A-2-4'; desc='Grava/arena limosa'; }
    else if (ip <= 10 && ll >= 41)              { grupo='A-2-5'; desc='Grava/arena limosa elástica'; }
    else if (ip >= 11 && ll <= 40)              { grupo='A-2-6'; desc='Grava/arena arcillosa'; }
    else if (ip >= 11 && ll >= 41)              { grupo='A-2-7'; desc='Grava/arena arcillosa elástica'; }
  } else {
    if (ll <= 40 && ip <= 10)      { grupo='A-4'; desc='Suelo limoso'; }
    else if (ll >= 41 && ip <= 10) { grupo='A-5'; desc='Suelo limoso elástico'; }
    else if (ll <= 40 && ip >= 11) { grupo='A-6'; desc='Suelo arcilloso'; }
    else if (ll >= 41 && ip >= 11) {
      if (ip <= ll - 30) { grupo='A-7-5'; desc='Suelo arcilloso elástico'; }
      else               { grupo='A-7-6'; desc='Suelo arcilloso muy elástico'; }
    }
  }

  const F   = Math.max(0, Math.min(100, F200));
  const LLg = Math.max(0, Math.min(60,  ll));
  const IPg = Math.max(0, Math.min(30,  ip));
  let IG = 0;
  if (F >= 35) {
    IG = (F - 35) * (0.2 + 0.005 * (LLg - 40));
    if (IPg >= 11) IG += 0.01 * (F - 15) * (IPg - 10);
  }
  IG = Math.max(0, Math.min(20, Math.round(IG)));

  return { grupo, desc, IG, nombre: `${grupo} (IG=${IG})` };
};

const obtenerGPS = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('GPS','Permiso denegado.'); return null; }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      lat: +loc.coords.latitude.toFixed(6),
      lng: +loc.coords.longitude.toFixed(6),
      acc: +loc.coords.accuracy?.toFixed(0),
    };
  } catch { Alert.alert('GPS','No se pudo obtener ubicación.'); return null; }
};

const persistirFoto = async (srcUri) => {
  try {
    const dir = FileSystem.documentDirectory + 'fotos';
    await FileSystem.makeDirectoryAsync(dir, { intermediates:true }).catch(()=>{});
    const dest = dir + '/foto_' + Date.now() + '.jpg';
    await FileSystem.copyAsync({ from:srcUri, to:dest });
    return dest;
  } catch { return srcUri; }
};
const tomarFoto = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') { Alert.alert('Cámara','Permiso denegado.'); return null; }
  const res = await ImagePicker.launchCameraAsync({ quality:0.6, allowsEditing:false });
  if (res.canceled) return null;
  return await persistirFoto(res.assets[0].uri);
};
const uriABase64 = async (uri) => {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return 'data:image/jpeg;base64,' + b64;
  } catch { return null; }
};

const enviarWhatsApp = async (texto) => {
  const enc = encodeURIComponent(texto);
  const app = `whatsapp://send?text=${enc}`;
  const web = `https://wa.me/?text=${enc}`;
  try {
    const ok = await Linking.canOpenURL(app);
    await Linking.openURL(ok ? app : web);
  } catch { Linking.openURL(web).catch(()=>{}); }
};

const SERIES_TAMICES = {
  'BSM/Asfalto espumado': [
    { nombre: '1½"',  mm: 38.1  },
    { nombre: '1"',   mm: 25.4  },
    { nombre: '¾"',   mm: 19.05 },
    { nombre: '½"',   mm: 12.7  },
    { nombre: '⅜"',   mm: 9.525 },
    { nombre: '#4',   mm: 4.75  },
    { nombre: '#8',   mm: 2.36  },
    { nombre: '#16',  mm: 1.18  },
    { nombre: '#40',  mm: 0.425 },
    { nombre: '#100', mm: 0.15  },
    { nombre: '#200', mm: 0.075 },
  ],
  'Suelo': [
    { nombre: '2"',   mm: 50.8  },
    { nombre: '1½"',  mm: 38.1  },
    { nombre: '1"',   mm: 25.4  },
    { nombre: '¾"',   mm: 19.05 },
    { nombre: '½"',   mm: 12.7  },
    { nombre: '⅜"',   mm: 9.525 },
    { nombre: '#4',   mm: 4.75  },
    { nombre: '#10',  mm: 2.00  },
    { nombre: '#40',  mm: 0.425 },
    { nombre: '#200', mm: 0.075 },
  ],
  'Microaglomerado': [
    { nombre: '¾"',   mm: 19.05 },
    { nombre: '½"',   mm: 12.7  },
    { nombre: '⅜"',   mm: 9.525 },
    { nombre: '#4',   mm: 4.75  },
    { nombre: '#8',   mm: 2.36  },
    { nombre: '#16',  mm: 1.18  },
    { nombre: '#30',  mm: 0.60  },
    { nombre: '#40',  mm: 0.425 },
    { nombre: '#50',  mm: 0.30  },
    { nombre: '#100', mm: 0.15  },
    { nombre: '#200', mm: 0.075 },
  ],
  'Lechada': [
    { nombre: '⅜"',   mm: 9.525 },
    { nombre: '#4',   mm: 4.75  },
    { nombre: '#8',   mm: 2.36  },
    { nombre: '#16',  mm: 1.18  },
    { nombre: '#30',  mm: 0.60  },
    { nombre: '#40',  mm: 0.425 },
    { nombre: '#50',  mm: 0.30  },
    { nombre: '#100', mm: 0.15  },
    { nombre: '#200', mm: 0.075 },
  ],
};

const BANCO = [
  { p:'¿Qué relación expresa el Límite Plástico?', ops:['Contenido de agua para 25 golpes','Contenido de agua al pasar de plástico a semisólido','Contenido de agua máximo','Densidad seca máxima'], ok:1, cat:'Atterberg' },
  { p:'El ensayo Proctor estándar usa…', ops:['3 capas, 25 golpes','3 capas, 56 golpes','5 capas, 25 golpes','5 capas, 56 golpes'], ok:0, cat:'Compactación' },
  { p:'La humedad óptima corresponde a…', ops:['La densidad seca mínima','La densidad seca máxima','La saturación total','Ninguna'], ok:1, cat:'Compactación' },
  { p:'Un suelo CL según SUCS es…', ops:['Grava bien gradada','Arcilla de baja plasticidad','Limo de alta plasticidad','Arena uniforme'], ok:1, cat:'Clasificación' },
  { p:'En un estabilizado con cal, el objetivo es…', ops:['Disminuir densidad','Modificar plasticidad y aumentar resistencia','Reducir CBR','Aumentar permeabilidad'], ok:1, cat:'Estabilización' },
  { p:'El CBR se mide a…', ops:['2.5 y 5 mm de penetración','5 y 10 mm','1 y 2 mm','10 y 20 mm'], ok:0, cat:'CBR' },
  { p:'El % de cemento típico en un estabilizado granular es…', ops:['0.1-0.5 %','2-8 %','15-20 %','30-40 %'], ok:1, cat:'Estabilización' },
  { p:'La densidad seca se calcula como…', ops:['ρh · (1+w)','ρh / (1+w)','ρh · w','ρh − w'], ok:1, cat:'Densidad' },
  { p:'Un IP = 0 indica…', ops:['Suelo muy plástico','Suelo no plástico','Suelo orgánico','Ninguna'], ok:1, cat:'Atterberg' },
  { p:'El tamiz N°200 corresponde a…', ops:['4.75 mm','2.00 mm','0.075 mm','0.425 mm'], ok:2, cat:'Granulometría' },
];

export default function App() {
  const [tab, setTab] = useState('inicio');
  const [ensayoAEditar, setEnsayoAEditar] = useState(null);
  const [operario, setOperario] = useState('');
  const [muestras, setMuestras] = useState([]);
  const [ensayos, setEnsayos] = useState([]);
  const [listo, setListo] = useState(false);
  const [online, setOnline] = useState(true);
  const [serverUrl, setServerUrl] = useState('');
  const [modoAdmin, setModoAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [obra, setObra] = useState('');
  const [obrasHistorial, setObrasHistorial] = useState([]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    NetInfo.fetch().then((s) => setOnline(!!s.isConnected)).catch(()=>{});
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [rm, re, ro, rs, rp, robra, rhist] = await Promise.all([
          AsyncStorage.getItem(K_MUESTRAS),
          AsyncStorage.getItem(K_ENSAYOS),
          AsyncStorage.getItem(K_OPERARIO),
          AsyncStorage.getItem(K_SERVER),
          AsyncStorage.getItem(K_PIN),
          AsyncStorage.getItem(K_OBRA),
          AsyncStorage.getItem(K_OBRAS_HIST),
        ]);
        if (rm) setMuestras(JSON.parse(rm));
        if (re) setEnsayos(JSON.parse(re));
        if (ro) setOperario(ro);
        if (rs) setServerUrl(rs);
        if (rp) setAdminPin(rp);
        if (robra) setObra(robra);
        if (rhist) setObrasHistorial(JSON.parse(rhist));
      } catch (e) { console.warn(e); }
      finally { setListo(true); }
    })();
  }, []);

  useEffect(() => {
    if (!listo) return;
    AsyncStorage.setItem(K_MUESTRAS, JSON.stringify(muestras)).catch(()=>{});
    AsyncStorage.setItem(K_ENSAYOS,  JSON.stringify(ensayos)).catch(()=>{});
    AsyncStorage.setItem(K_OPERARIO, operario).catch(()=>{});
    AsyncStorage.setItem(K_SERVER,   serverUrl).catch(()=>{});
    AsyncStorage.setItem(K_PIN, adminPin).catch(()=>{});
    AsyncStorage.setItem(K_OBRA, obra).catch(()=>{});
    AsyncStorage.setItem(K_OBRAS_HIST, JSON.stringify(obrasHistorial)).catch(()=>{});
  }, [muestras, ensayos, operario, serverUrl, adminPin, obra, obrasHistorial, listo]);

  const guardarEnsayo = (e) => {
    if (!operario || !operario.trim()) {
      Alert.alert('⚠️ Falta operario', 'Antes de guardar ensayos, escribí tu nombre en Inicio.', [{ text: 'OK' }]);
      return false;
    }
    if (!obra || !obra.trim()) {
      Alert.alert('⚠️ Falta obra', 'Antes de guardar ensayos, escribí la obra en Inicio.', [{ text: 'OK' }]);
      return false;
    }
    const obraLimpia = obra.trim();
    if (!obrasHistorial.includes(obraLimpia)) {
      setObrasHistorial((prev) => [obraLimpia, ...prev].slice(0, 100));
    }
    setEnsayos((prev) => [
      { id: Date.now().toString(), fecha: new Date().toISOString(),
        operario: operario.trim(), obra: obraLimpia,
        sincronizado: false, ...e },
      ...prev,
    ]);
    setTimeout(() => {
      if (online && serverUrl) sincronizar({ silencioso: true });
    }, 2000);
    return true;
  };
  const borrarEnsayo = (id) => setEnsayos((prev) => prev.filter((x) => x.id !== id));

  const sincronizar = async (opciones = {}) => {
    const sil = opciones && opciones.silencioso;
    if (!online) { if (!sil) Alert.alert('Sin conexión','Se sincronizará al recuperar internet.'); return; }
    if (!serverUrl.trim()) { if (!sil) Alert.alert('Falta servidor','Configurá la URL del servidor.'); return; }
    const pendientes = ensayos.filter((e) => !e.sincronizado);
    if (pendientes.length === 0) { if (!sil) Alert.alert('Todo al día','No hay ensayos pendientes.'); return; }
    try {
      const resp = await fetch(serverUrl.replace(/\/+$/,''), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ operario, dispositivo: Platform.OS, ensayos: pendientes }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const ids = new Set(pendientes.map((p) => p.id));
      setEnsayos((prev) => prev.map((e) => ids.has(e.id) ? { ...e, sincronizado: true } : e));
      if (!sil) Alert.alert('✅', `${pendientes.length} ensayos sincronizados.`);
    } catch (err) {
      if (!sil) Alert.alert('Error de red', err.message || 'No se pudo sincronizar.');
    }
  };

  useEffect(() => {
    if (!listo || !online || !serverUrl) return;
    const pendientes = ensayos.filter((e) => !e.sincronizado);
    if (pendientes.length === 0) return;
    const timer = setTimeout(() => {
      sincronizar({ silencioso: true });
    }, 2000);
    return () => clearTimeout(timer);
  }, [ensayos, online, serverUrl, listo]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={s.header}>
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <View>
            <Text style={s.headerTitle}>LabSuelos</Text>
            <Text style={s.headerSub}>
              {operario ? `Operario: ${operario}` : 'Suelos · Estabilizados · Ensayos'}
            </Text>
          </View>
          <View style={[s.estado, {
            backgroundColor: online ? C.ok+'22' : C.danger+'22',
            borderColor: online ? C.ok : C.danger,
          }]}>
            <View style={[s.estadoDot, { backgroundColor: online ? C.ok : C.danger }]}/>
            <Text style={{ color: online ? C.ok : C.danger, fontSize: 10, fontWeight:'800' }}>
              {online ? 'EN LÍNEA' : 'SIN RED'}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {tab==='inicio' && (
          <Inicio
            muestras={muestras} ensayos={ensayos} irA={setTab}
            operario={operario} setOperario={setOperario}
            online={online} serverUrl={serverUrl} setServerUrl={setServerUrl}
            sincronizar={sincronizar}
            modoAdmin={modoAdmin} setModoAdmin={setModoAdmin}
            adminPin={adminPin} setAdminPin={setAdminPin}
            obra={obra} setObra={setObra}
            obrasHistorial={obrasHistorial}
          />
        )}
                {tab==='muestras'  && <Muestras items={muestras} setItems={setMuestras} />}
        {tab==='calc'      && <Calculos muestras={muestras} guardarEnsayo={guardarEnsayo} borrarEnsayo={borrarEnsayo} operario={operario} ensayoAEditar={ensayoAEditar} setEnsayoAEditar={setEnsayoAEditar} />}
        {tab==='preguntas' && <Preguntas />}
{tab==='reportes'  && <Reportes muestras={muestras} ensayos={ensayos}
                                     borrarEnsayo={borrarEnsayo} operario={operario} 
                                     setTab={setTab} setEnsayoAEditar={setEnsayoAEditar} />}
      </View>

      <View style={s.tabbar}>
        {TABS.map((t) => {
          const act = tab === t.id;
          return (
            <TouchableOpacity key={t.id} style={s.tabItem} onPress={() => setTab(t.id)}>
              <Text style={{ fontSize: 17, opacity: act ? 1 : 0.5 }}>{t.icon}</Text>
              <Text style={[s.tabLabel, act && { color: C.accent }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function Inicio({ muestras, ensayos, irA, operario, setOperario,
                  online, serverUrl, setServerUrl, sincronizar,
                  modoAdmin, setModoAdmin, adminPin, setAdminPin,
                  obra, setObra, obrasHistorial }) {
  const [toquesTitulo, setToquesTitulo] = useState(0);
  const [pinInput, setPinInput] = useState('');
  const [mostrarPin, setMostrarPin] = useState(false);
  const ult = ensayos.slice(0, 5);
  const porTipo = ensayos.reduce((a,e)=>{ a[e.tipo]=(a[e.tipo]||0)+1; return a; }, {});
  const pendientes = ensayos.filter((e)=>!e.sincronizado).length;

  return (
    <KeyboardAwareScrollView 
      contentContainerStyle={s.scroll} 
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={100}
    >
        <View style={[s.card, ((!operario || !operario.trim()) || (!obra || !obra.trim())) && { borderColor: C.danger, borderWidth: 1.5 }]}>
          <Text style={s.cardTitle}>👤 Operario</Text>
          <TextInput
            style={[s.input, (!operario || !operario.trim()) && { borderColor: C.danger }]}
            placeholder="Escribí tu nombre para poder guardar ensayos"
            placeholderTextColor={C.muted}
            value={operario}
            onChangeText={setOperario}
          />
          {(!operario || !operario.trim()) ? (
            <Text style={[s.itemSub, { color: C.danger, marginTop: 8, fontWeight: '700' }]}>
              ⚠️ Obligatorio para guardar ensayos
            </Text>
          ) : (
            <Text style={[s.itemSub, { color: C.ok, marginTop: 8, fontWeight: '700' }]}>
              ✅ Operario configurado
            </Text>
          )}

          <Text style={[s.cardTitle, { marginTop: 16 }]}>🏗️ Obra</Text>
          <TextInput
            style={[s.input, (!obra || !obra.trim()) && { borderColor: C.danger }]}
            placeholder="Escribí la obra (ej. Obra N°1)"
            placeholderTextColor={C.muted}
            value={obra}
            onChangeText={setObra}
          />
          {(!obra || !obra.trim()) ? (
            <Text style={[s.itemSub, { color: C.danger, marginTop: 8, fontWeight: '700' }]}>
              ⚠️ Obligatorio para guardar ensayos
            </Text>
          ) : (
            <Text style={[s.itemSub, { color: C.ok, marginTop: 8, fontWeight: '700' }]}>
              ✅ Obra configurada
            </Text>
          )}

          {obrasHistorial && obrasHistorial.length > 0 && (
            <>
              <Text style={[s.label, { marginTop: 10 }]}>💡 Obras usadas recientemente:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {obrasHistorial.slice(0, 15).map((o) => (
                  <TouchableOpacity
                    key={o}
                    style={[s.chip, obra === o && s.chipActivo]}
                    onPress={() => setObra(o)}
                  >
                    <Text style={[s.chipText, obra === o && { color: '#1A1004' }]}>
                      {o}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>

        <View style={s.card}>
          <View style={s.filaItem}>
            <TouchableOpacity
              onPress={() => {
                const nuevo = toquesTitulo + 1;
                setToquesTitulo(nuevo);
                if (nuevo >= 5) {
                  setToquesTitulo(0);
                  if (modoAdmin) {
                    setModoAdmin(false);
                    Alert.alert('🔒 Bloqueado', 'Modo admin desactivado.');
                  } else {
                    setPinInput('');
                    setMostrarPin(true);
                  }
                }
                setTimeout(() => setToquesTitulo(0), 3000);
              }}
              activeOpacity={1}
            >
              <Text style={s.cardTitle}>
                ☁️ Sincronización {modoAdmin ? '🔓' : ''}
              </Text>
            </TouchableOpacity>
            <Text style={[s.itemSub,{ color: online ? C.ok : C.danger, fontWeight:'700' }]}>
              {online ? '● En línea' : '● Sin red'}
            </Text>
          </View>

          {modoAdmin && (
            <>
              <Text style={s.label}>URL del servidor (opcional)</Text>
              <TextInput style={s.input} placeholder="https://mi-servidor.com/api"
                placeholderTextColor={C.muted} value={serverUrl}
                onChangeText={setServerUrl} autoCapitalize="none" keyboardType="url"/>
            </>
          )}

          <View style={[s.filaItem,{marginTop:10}]}>
            <Text style={s.itemSub}>Pendientes de sincronizar</Text>
            <Text style={[s.itemTitulo, pendientes>0 && { color: C.accent }]}>{pendientes}</Text>
          </View>

          {modoAdmin && (
            <>
              <TouchableOpacity
                style={[s.btnPrimary, (!online || pendientes===0) && { opacity:0.5 }]}
                onPress={() => sincronizar()}
                disabled={!online || pendientes===0}>
                <Text style={s.btnPrimaryText}>
                  {online ? `🔄 Sincronizar (${pendientes})` : '⛔ Sin conexión'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btnGhost, { marginTop: 8 }]}
                onPress={() => {
                  setPinInput('');
                  setMostrarPin(true);
                }}>
                <Text style={s.btnGhostText}>🔑 Cambiar PIN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btnGhost, { marginTop: 8 }]}
                onPress={() => {
                  setModoAdmin(false);
                  Alert.alert('🔒 Bloqueado', 'La URL y el botón Sincronizar quedan ocultos.');
                }}>
                <Text style={s.btnGhostText}>🔒 Bloquear modo admin</Text>
              </TouchableOpacity>
            </>
          )}

          {!modoAdmin && (
            <Text style={[s.itemSub, { marginTop: 10, textAlign: 'center', fontSize: 10, opacity: 0.5 }]}>
              Todo se sincroniza automáticamente
            </Text>
          )}
        </View>

        {mostrarPin && (
          <View style={[s.card, { borderColor: C.accent, borderWidth: 1.5 }]}>
            <Text style={s.cardTitle}>
              {adminPin ? '🔑 Ingresá el PIN' : '🔑 Creá un PIN de 4 dígitos'}
            </Text>
            <Text style={[s.itemSub, { marginBottom: 10 }]}>
              {adminPin
                ? 'Solo el administrador puede acceder'
                : 'Primera vez: elegí un PIN de 4 dígitos'}
            </Text>
            <TextInput
              style={[s.input, { fontSize: 28, textAlign: 'center', letterSpacing: 15 }]}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              value={pinInput}
              onChangeText={(t) => setPinInput(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              placeholderTextColor={C.muted}
              autoFocus
            />
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <TouchableOpacity
                style={[s.btnGhost, { flex: 1, marginRight: 6 }]}
                onPress={() => { setMostrarPin(false); setPinInput(''); }}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnPrimary, { flex: 1, marginLeft: 6, marginTop: 0 }]}
                onPress={() => {
                  if (pinInput.length !== 4) {
                    Alert.alert('PIN inválido', 'Debe tener 4 dígitos.');
                    return;
                  }
                  if (!adminPin) {
                    setAdminPin(pinInput);
                    setModoAdmin(true);
                    setMostrarPin(false);
                    setPinInput('');
                    Alert.alert('✅ PIN creado', 'Modo admin activado.');
                  } else {
                    if (pinInput === adminPin) {
                      setModoAdmin(true);
                      setMostrarPin(false);
                      setPinInput('');
                      Alert.alert('🔓 Modo admin', 'Acceso concedido.');
                    } else {
                      Alert.alert('❌ PIN incorrecto', 'Intentá de nuevo.');
                      setPinInput('');
                    }
                  }
                }}>
                <Text style={s.btnPrimaryText}>
                  {adminPin ? 'Desbloquear' : 'Crear PIN'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={s.row}>
          <View style={[s.card, s.statCard]}>
            <Text style={s.statNum}>{muestras.length}</Text>
            <Text style={s.statLabel}>Muestras</Text>
          </View>
          <View style={[s.card, s.statCard]}>
            <Text style={[s.statNum, { color: C.accent2 }]}>{ensayos.length}</Text>
            <Text style={s.statLabel}>Ensayos</Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Accesos rápidos</Text>
          <View style={s.row}>
            <TouchableOpacity style={[s.btnMini,{flex:1}]} onPress={()=>irA('muestras')}>
              <Text style={s.btnMiniText}>🗂️ Muestras</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnMini,{flex:1}]} onPress={()=>irA('calc')}>
              <Text style={s.btnMiniText}>🧮 Ensayos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnMini,{flex:1}]} onPress={()=>irA('reportes')}>
              <Text style={s.btnMiniText}>📄 PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {Object.keys(porTipo).length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Ensayos por tipo</Text>
            {Object.entries(porTipo).map(([k,v]) => (
              <View key={k} style={s.filaItem}>
                <Text style={s.itemTitulo}>{k}</Text>
                <Text style={s.itemSub}>{v}</Text>
              </View>
            ))}
          </View>
        )}

        {ult.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Últimos ensayos</Text>
            {ult.map((e)=>(
              <View key={e.id} style={{ marginBottom: 8 }}>
                <Text style={s.itemTitulo}>
                  {e.tipo} · {e.muestra||'s/c'}
                  {!e.sincronizado && <Text style={{color:C.accent}}>  ●</Text>}
                </Text>
                <Text style={s.itemSub}>{e.resultado}</Text>
              </View>
            ))}
          </View>
        )}
      </KeyboardAwareScrollView>
  );
}

function Muestras({ items, setItems }) {
  const [codigo, setCodigo] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [profundidad, setProfundidad] = useState('');
  const [tipo, setTipo] = useState('Suelo');
  const [gps, setGps] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [cargandoGPS, setCargandoGPS] = useState(false);
  const [obs, setObs] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const TIPOS = ['Suelo','Estabilizado','Calicata','SPT','Bloque','Otro'];

  const pedirGPS = async () => {
    setCargandoGPS(true);
    const g = await obtenerGPS();
    setCargandoGPS(false);
    if (g) setGps(g);
  };
  const sacarFoto = async () => {
    const uri = await tomarFoto();
    if (uri) setFotos((f)=>[...f, uri]);
  };
  const quitarFoto = (i) => setFotos((f)=>f.filter((_,idx)=>idx!==i));

  const agregar = () => {
    if (!codigo.trim()) return Alert.alert('Falta código','Asigná un código (ej. M-01).');
    setItems([{
      id: Date.now().toString(), codigo: codigo.trim(),
      ubicacion: ubicacion.trim(), profundidad: profundidad.trim(),
      tipo, gps, fotos, observaciones: obs.trim(), fecha: hoy(),
    }, ...items]);
    setCodigo(''); setUbicacion(''); setProfundidad('');
    setGps(null); setFotos([]); setObs('');
  };

  const borrar = (id,c) => Alert.alert('Eliminar',`¿Borrar "${c}"?`,[
    { text:'Cancelar', style:'cancel' },
    { text:'Eliminar', style:'destructive',
      onPress: () => setItems(items.filter((i)=>i.id!==id)) },
  ]);

  const filtradas = items.filter((i)=>
    (i.codigo+i.ubicacion).toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <KeyboardAwareScrollView 
      contentContainerStyle={s.scroll} 
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={100}
    >
        <View style={s.card}>
          <Text style={s.cardTitle}>Nueva muestra</Text>
          <TextInput style={s.input} placeholder="Código (ej. M-01)"
            placeholderTextColor={C.muted} value={codigo} onChangeText={setCodigo}/>
          <View style={{height:8}}/>
          <TextInput style={s.input} placeholder="Ubicación / Progresiva"
            placeholderTextColor={C.muted} value={ubicacion} onChangeText={setUbicacion}/>
          <View style={{height:8}}/>
          <TextInput style={s.input} placeholder="Profundidad (ej. 0.50 - 1.00 m)"
            placeholderTextColor={C.muted} value={profundidad} onChangeText={setProfundidad}/>

          <Text style={s.label}>Tipo</Text>
          <View style={s.chipsWrap}>
            {TIPOS.map((t)=>(
              <TouchableOpacity key={t} style={[s.chip, tipo===t && s.chipActivo]}
                onPress={()=>setTipo(t)}>
                <Text style={[s.chipText, tipo===t && { color:'#1A1004' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>📍 Ubicación GPS</Text>
          {gps ? (
            <View style={s.gpsBox}>
              <Text style={s.itemTitulo}>Lat {gps.lat} · Lon {gps.lng}</Text>
              {gps.acc && <Text style={s.itemSub}>Precisión ±{gps.acc} m</Text>}
              <TouchableOpacity style={[s.btnGhost,{marginTop:8}]} onPress={pedirGPS}>
                <Text style={s.btnGhostText}>Actualizar GPS</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.btnGhost} onPress={pedirGPS} disabled={cargandoGPS}>
              {cargandoGPS
                ? <ActivityIndicator color={C.text}/>
                : <Text style={s.btnGhostText}>📡 Capturar coordenadas</Text>}
            </TouchableOpacity>
          )}

          <Text style={s.label}>📷 Fotos ({fotos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {fotos.map((f,i)=>(
              <TouchableOpacity key={i} onPress={()=>quitarFoto(i)} style={{ marginRight:8 }}>
                <Image source={{uri:f}} style={s.mini}/>
                <Text style={[s.itemSub,{textAlign:'center',fontSize:10}]}>tocar para borrar</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.addFoto} onPress={sacarFoto}>
              <Text style={{color:C.text,fontSize:24}}>＋</Text>
            </TouchableOpacity>
          </ScrollView>

          <Text style={s.label}>📝 Observaciones</Text>
          <TextInput style={[s.input,{minHeight:70,textAlignVertical:'top'}]}
            multiline placeholder="Notas de campo..."
            placeholderTextColor={C.muted} value={obs} onChangeText={setObs}/>

          <TouchableOpacity style={s.btnPrimary} onPress={agregar}>
            <Text style={s.btnPrimaryText}>+ Agregar muestra</Text>
          </TouchableOpacity>
        </View>

        <TextInput style={[s.input,{marginBottom:12}]}
          placeholder="🔍 Buscar" placeholderTextColor={C.muted}
          value={busqueda} onChangeText={setBusqueda}/>

        {filtradas.length === 0 ? (
          <View style={s.card}><Text style={s.itemSub}>Sin muestras cargadas.</Text></View>
        ) : filtradas.map((m)=>(
          <View key={m.id} style={s.card}>
            <View style={s.filaItem}>
              <View style={{flex:1}}>
                <Text style={s.itemTitulo}>{m.codigo} · {m.tipo}</Text>
                <Text style={s.itemSub}>
                  {m.ubicacion||'—'}{m.profundidad?` · ${m.profundidad}`:''}
                </Text>
                {m.gps && <Text style={s.itemSub}>📍 {m.gps.lat}, {m.gps.lng}</Text>}
                {m.observaciones ? <Text style={[s.itemSub,{marginTop:2}]}>📝 {m.observaciones}</Text> : null}
                {m.fotos?.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:6}}>
                    {m.fotos.map((f,i)=>(
                      <Image key={i} source={{uri:f}} style={[s.mini,{marginRight:6}]}/>
                    ))}
                  </ScrollView>
                )}
              </View>
              <TouchableOpacity style={[s.btnRound,{borderColor:C.danger+'66'}]}
                onPress={()=>borrar(m.id,m.codigo)}>
                <Text style={[s.btnRoundText,{color:C.danger}]}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </KeyboardAwareScrollView>
  );
}

function Calculos({ muestras, guardarEnsayo, borrarEnsayo, operario, ensayoAEditar, setEnsayoAEditar }) {
  const [modo, setModo] = useState('humedad');
  const MODOS = [
    { id:'humedad',     label:'Humedad' },
    { id:'densidad',    label:'Densidad' },
    { id:'atterberg',   label:'Índice Plástico' },
    { id:'contraccion', label:'Contracción' },
    { id:'proctor',     label:'Proctor' },
    { id:'cono',        label:'Cono de arena' },
    { id:'cbr',         label:'CBR' },
    { id:'aashto',      label:'AASHTO' },
    { id:'dosif',       label:'Dosificación' },
    { id:'granulo',     label:'Granulometría' },
    { id:'its',         label:'ITS (Asfalto)' },
  ];
  return (
    <KeyboardAwareScrollView 
      contentContainerStyle={s.scroll} 
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={100}
    >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 4 }}>
          {MODOS.map((m)=>(
            <TouchableOpacity key={m.id}
              style={[s.tabCalc, modo===m.id && s.tabCalcActivo]}
              onPress={()=>setModo(m.id)}>
              <Text style={[s.tabCalcText, modo===m.id && { color:'#1A1004' }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ height: 12 }} />

        {modo==='humedad'     && <CalcHumedad      muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='densidad'    && <CalcDensidad     muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='atterberg'   && <CalcAtterberg    muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='contraccion' && <CalcContraccion  muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='proctor'     && <CalcProctor      muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='cono'        && <CalcConoArena    muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='cbr'         && <CalcCBR          muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='aashto'      && <CalcAASHTO       muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='dosif'       && <CalcDosif        muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='granulo'     && <CalcGranulo      muestras={muestras} guardarEnsayo={guardarEnsayo}/>}
        {modo==='its'         && <CalcITS          muestras={muestras} guardarEnsayo={guardarEnsayo} borrarEnsayo={borrarEnsayo} ensayoAEditar={ensayoAEditar} setEnsayoAEditar={setEnsayoAEditar}/>}
      </KeyboardAwareScrollView>
  );
}

function SelectorMuestra({ muestras, valor, setValor }) {
  if (muestras.length === 0) {
    return (
      <View style={s.aviso}>
        <Text style={s.avisoText}>💡 Cargá una muestra para asociar el ensayo.</Text>
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {muestras.slice(0,12).map((m)=>{
        const act = valor===m.codigo;
        return (
          <TouchableOpacity key={m.id}
            style={[s.chip, act && s.chipActivo]} onPress={()=>setValor(act?'':m.codigo)}>
            <Text style={[s.chipText, act && { color:'#1A1004' }]}>{m.codigo}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
function ResultadoBox({ label, valor, sub, color }) {
  return (
    <View style={[s.resultado, color && { borderColor: color+'66' }]}>
      <Text style={s.resultadoLabel}>{label}</Text>
      <Text style={[s.resultadoValor, color && { color }]}>{valor}</Text>
      {sub ? <Text style={s.itemSub}>{sub}</Text> : null}
    </View>
  );
}
function ObsInput({ value, onChange }) {
  return (
    <>
      <Text style={s.label}>📝 Observaciones (opcional)</Text>
      <TextInput style={[s.input,{minHeight:60,textAlignVertical:'top'}]} multiline
        placeholder="Notas, condiciones, incidencias..."
        placeholderTextColor={C.muted} value={value} onChangeText={onChange}/>
    </>
  );
}
function BotonGuardar({ onPress }) {
  return (
    <TouchableOpacity style={s.btnPrimary} onPress={onPress}>
      <Text style={s.btnPrimaryText}>💾 Guardar ensayo</Text>
    </TouchableOpacity>
  );
}

function CalcHumedad({ muestras, guardarEnsayo }) {
  const [mh,setMh]=useState(''); const [ms,setMs]=useState('');
  const [cod,setCod]=useState(''); const [obs,setObs]=useState('');
  const Mh=num(mh), Ms=num(ms);
  const ok = Number.isFinite(Mh)&&Number.isFinite(Ms)&&Ms>0&&Mh>=Ms;
  const w = ok ? ((Mh-Ms)/Ms)*100 : null;
  const guardar = () => {
    if (!ok) return Alert.alert('Datos inválidos','Verificá Mh ≥ Ms y Ms > 0.');
    guardarEnsayo({
      tipo:'Humedad natural', muestra:cod||'s/c',
      entradas:`Mh=${Mh} g · Ms=${Ms} g`,
      resultado:`w = ${r(w)} %`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅','Ensayo guardado.');
    setMh(''); setMs(''); setObs('');
  };
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Humedad natural</Text>
      <Text style={s.formula}>w (%) = (Mh − Ms) / Ms × 100</Text>
      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>
      <Text style={s.label}>Masa húmeda (g)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 245.6"
        placeholderTextColor={C.muted} value={mh} onChangeText={setMh}/>
      <Text style={s.label}>Masa seca (g)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 210.3"
        placeholderTextColor={C.muted} value={ms} onChangeText={setMs}/>
      <ResultadoBox label="Humedad" valor={w!==null?`${r(w)} %`:'—'}
        sub={ok?`Agua perdida: ${r(Mh-Ms)} g`:null} color={C.ok}/>
      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function CalcHigroscopica({ muestras, guardarEnsayo }) {
  const [cod,setCod]=useState(''); const [obs,setObs]=useState('');
  const [mh,setMh]=useState(''); const [ms,setMs]=useState('');
  const MH=num(mh), MS=num(ms);
  const ok = Number.isFinite(MH)&&Number.isFinite(MS)&&MS>0&&MH>=MS;
  const wh = ok ? ((MH-MS)/MS)*100 : null;
  const guardar = () => {
    if (!ok) return Alert.alert('Datos inválidos','Verificá Mh ≥ Ms y Ms > 0.');
    guardarEnsayo({
      tipo:'Humedad higroscópica', muestra:cod||'s/c',
      entradas:`Mh=${MH} g · Ms=${MS} g`,
      resultado:`wh = ${r(wh)} %`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅','Higroscópica guardada.');
    setMh(''); setMs(''); setObs('');
  };
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Humedad higroscópica</Text>
      <Text style={s.formula}>wh (%) = (Mh − Ms) / Ms × 100</Text>
      <Text style={[s.itemSub,{marginBottom:8}]}>
        Masa en equilibrio con el ambiente vs masa seca en estufa (105 ± 5 °C)
      </Text>
      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>
      <Text style={s.label}>Masa higroscópica Mh (g)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 51.2"
        placeholderTextColor={C.muted} value={mh} onChangeText={setMh}/>
      <Text style={s.label}>Masa seca Ms (g)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 50.0"
        placeholderTextColor={C.muted} value={ms} onChangeText={setMs}/>
      <ResultadoBox label="Humedad higroscópica"
        valor={wh!==null?`${r(wh,2)} %`:'—'}
        sub="Suelo en equilibrio con el ambiente" color={C.ok}/>
      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function CalcDensidad({ muestras, guardarEnsayo }) {
  const [m,setM]=useState(''); const [v,setV]=useState('');
  const [w,setW]=useState(''); const [cod,setCod]=useState('');
  const [obs,setObs]=useState('');
  const M=num(m), V=num(v), W=num(w);
  const ok = Number.isFinite(M)&&Number.isFinite(V)&&V>0;
  const ph = ok ? M/V : null;
  const ps = ok&&Number.isFinite(W) ? ph/(1+W/100) : null;
  const guardar = () => {
    if (!ok) return Alert.alert('Datos inválidos','Masa y volumen > 0.');
    guardarEnsayo({
      tipo:'Densidad', muestra:cod||'s/c',
      entradas:`M=${M} g · V=${V} cm³${Number.isFinite(W)?` · w=${W}%`:''}`,
      resultado:`ρh=${r(ph,3)} g/cm³${ps!==null?` · ρs=${r(ps,3)} g/cm³`:''}`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅','Ensayo guardado.');
    setM(''); setV(''); setW(''); setObs('');
  };
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Densidad</Text>
      <Text style={s.formula}>ρh = M/V · ρs = ρh/(1+w/100)</Text>
      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>
      <Text style={s.label}>Masa (g)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 380"
        placeholderTextColor={C.muted} value={m} onChangeText={setM}/>
      <Text style={s.label}>Volumen (cm³)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 200"
        placeholderTextColor={C.muted} value={v} onChangeText={setV}/>
      <Text style={s.label}>Humedad w% (opcional)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 12.5"
        placeholderTextColor={C.muted} value={w} onChangeText={setW}/>
      <ResultadoBox label="Densidad húmeda" valor={ph!==null?`${r(ph,3)} g/cm³`:'—'}
        sub={ps!==null?`Densidad seca: ${r(ps,3)} g/cm³`:'Ingresá w para densidad seca'}
        color={C.ok}/>
      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function CalcAtterberg({ muestras, guardarEnsayo }) {
  const [ll,setLl]=useState(''); const [lp,setLp]=useState('');
  const [cod,setCod]=useState(''); const [obs,setObs]=useState('');
  const LL=num(ll), LP=num(lp);
  const ok = Number.isFinite(LL)&&Number.isFinite(LP)&&LL>=LP&&LL>0;
  const ip = ok ? LL-LP : null;
  const clasif = clasifIP(ip);
  const guardar = () => {
    if (!ok) return Alert.alert('Datos inválidos','Se requiere LL ≥ LP.');
    guardarEnsayo({
      tipo:'Límites de Atterberg', muestra:cod||'s/c',
      entradas:`LL=${LL}% · LP=${LP}%`,
      resultado:`IP = ${r(ip)}% (${clasif})`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅','Ensayo guardado.');
    setLl(''); setLp(''); setObs('');
  };
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Índice de Plasticidad (IP)</Text>
      <Text style={s.formula}>IP = LL − LP</Text>
      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>
      <Text style={s.label}>Límite Líquido LL (%)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 42"
        placeholderTextColor={C.muted} value={ll} onChangeText={setLl}/>
      <Text style={s.label}>Límite Plástico LP (%)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 22"
        placeholderTextColor={C.muted} value={lp} onChangeText={setLp}/>
      <ResultadoBox label="Índice de plasticidad" valor={ip!==null?`${r(ip)} %`:'—'}
        sub={ip!==null?clasif:null} color={C.ok}/>
      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function CalcContraccion({ muestras, guardarEnsayo }) {
  const [cod,setCod]=useState(''); const [obs,setObs]=useState('');
  const [wi,setWi]=useState(''); const [Vi,setVi]=useState('');
  const [Vf,setVf]=useState(''); const [Ms,setMs]=useState('');

  const W=num(wi), VI=num(Vi), VF=num(Vf), MS=num(Ms);
  const ok = Number.isFinite(W)&&Number.isFinite(VI)&&Number.isFinite(VF)&&Number.isFinite(MS)&&MS>0;
  const dv = ok ? (VI - VF) : null;
  const wCon = (dv!==null && MS>0) ? (dv/MS)*100 : null;
  const ls = (ok && wCon!==null) ? (W - wCon) : null;
  const rc = (ok && VF!==null) ? (MS/VF) : null;

  const guardar = () => {
    if (!ok) return Alert.alert('Datos inválidos','Verificá volumen y masa seca.');
    guardarEnsayo({
      tipo:'Límite de contracción', muestra:cod||'s/c',
      entradas:`wi=${W}% · Vi=${VI} cm³ · Vf=${VF} cm³ · Ms=${MS} g`,
      resultado:`LC = ${r(ls)} %`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅','Contracción guardada.');
    setWi(''); setVi(''); setVf(''); setMs(''); setObs('');
  };
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Límite de contracción</Text>
      <Text style={s.formula}>LC = wi − (Vi−Vf)/Ms × 100</Text>
      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>
      <Text style={s.label}>Humedad inicial wi (%)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 45"
        value={wi} onChangeText={setWi} placeholderTextColor={C.muted}/>
      <Text style={s.label}>Volumen inicial Vi (cm³)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 25.5"
        value={Vi} onChangeText={setVi} placeholderTextColor={C.muted}/>
      <Text style={s.label}>Volumen final seco Vf (cm³)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 15.8"
        value={Vf} onChangeText={setVf} placeholderTextColor={C.muted}/>
      <Text style={s.label}>Masa seca Ms (g)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 42"
        value={Ms} onChangeText={setMs} placeholderTextColor={C.muted}/>
      <ResultadoBox label="Límite de contracción" valor={ls!==null?`${r(ls)} %`:'—'}
        sub={rc!==null?`Relación de contracción = ${r(rc,3)} g/cm³`:null} color={C.ok}/>
      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function CalcProctor({ muestras, guardarEnsayo }) {
  const [cod,setCod]=useState('');
  const [obs,setObs]=useState('');
  const [volMolde,setVolMolde]=useState('');
  const [pesoMoldeVacio,setPesoMoldeVacio]=useState('');
  const [puntos,setPuntos]=useState(
    Array.from({length:5},()=>({ mh:'', mw:'', ms:'' }))
  );
  const [tipo,setTipo]=useState('I');
  const [fechaProd,setFechaProd]=useState(hoy());

  const setP = (i,k,v) => setPuntos((p)=>p.map((it,idx)=>idx===i?{...it,[k]:v}:it));

  const procesar = () => {
    const VM = num(volMolde);
    const PMV = num(pesoMoldeVacio);
    if (!Number.isFinite(VM) || VM <= 0 || !Number.isFinite(PMV)) return [];
    
    const arr = [];
    puntos.forEach((p) => {
      const Mh = num(p.mh); 
      const Mw = num(p.mw); 
      const Ms = num(p.ms); 
      
      if (Number.isFinite(Mh) && Number.isFinite(Mw) && Number.isFinite(Ms) && Ms > 0 && Mh > PMV) {
        const w = ((Mw - Ms) / Ms) * 100;
        const sueloHumedo = Mh - PMV;
        const rhoH = sueloHumedo / VM;
        const rhoS = rhoH / (1 + w/100);
        arr.push({ w, ds: rhoS, rh: rhoH });
      }
    });
    return arr;
  };

  const validos = procesar();
  const ajuste = validos.length >= 3 ? regresionCuadratica(validos.map(p=>({x:p.w, y:p.ds}))) : null;
  let wOpt = null, dsMax = null;
  if (ajuste && ajuste.a < 0) {
    wOpt = -ajuste.b / (2 * ajuste.a);
    dsMax = ajuste.a*wOpt*wOpt + ajuste.b*wOpt + ajuste.c;
  }

  const guardar = () => {
    if (validos.length < 3) return Alert.alert('Faltan puntos','Ingresá al menos 3 puntos válidos.');
    guardarEnsayo({
            tipo:`Proctor ${tipo}`, muestra:cod||'s/c', fechaProd: fechaProd || hoy(),
      entradas:`${validos.length} puntos · Molde ${volMolde} cm³ · Molde vacío ${pesoMoldeVacio} g`,
      resultado: wOpt!==null
        ? `w_opt=${r(wOpt)} % · ρs,máx=${r(dsMax,3)} g/cm³`
        : 'Ajuste no válido',
      observaciones: obs.trim(),
      detalle: validos.map((p,i)=>`P${i+1}: w=${r(p.w)}% ρs=${r(p.ds,3)} g/cm³`).join(' | '),
    });
    Alert.alert('✅','Proctor guardado.');
    setObs('');
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Proctor completo</Text>
      <Text style={s.formula}>w = (Mw−Ms)/Ms · ρs = ρh/(1+w/100)</Text>

      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>
<Text style={s.label}>Tipo de Proctor (Norma Vialidad)</Text>
      <View style={s.chipsWrap}>
        {['I', 'II', 'III', 'IV', 'V'].map((t)=>(
          <TouchableOpacity key={t} style={[s.chip, tipo===t && s.chipActivo]}
            onPress={()=>setTipo(t)}>
            <Text style={[s.chipText, tipo===t && { color:'#1A1004' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.row}>
        <View style={{flex:1}}>
      <Text style={s.label}>Fecha de Producción</Text>
      <TextInput style={s.input} placeholder="AAAA-MM-DD" 
        placeholderTextColor={C.muted} value={fechaProd} onChangeText={setFechaProd}/>

          <Text style={s.label}>Vol. molde (cm³)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 2124"
            placeholderTextColor={C.muted} value={volMolde} onChangeText={setVolMolde}/>
        </View>
        <View style={{width:10}}/>
        <View style={{flex:1}}>
          <Text style={s.label}>Peso molde vacío (g)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 5490"
            placeholderTextColor={C.muted} value={pesoMoldeVacio} onChangeText={setPesoMoldeVacio}/>
        </View>
      </View>

      <Text style={s.label}>Puntos</Text>
      {puntos.map((p,i)=>{
        const Mh=num(p.mh), Mw=num(p.mw), Ms=num(p.ms);
        const okP = Number.isFinite(Mh)&&Number.isFinite(Mw)&&Number.isFinite(Ms)&&Ms>0&&Mh>num(pesoMoldeVacio);
        const w = okP ? ((Mw-Ms)/Ms)*100 : null;
        const rhoH = okP ? (Mh-num(pesoMoldeVacio))/num(volMolde) : null;
        const rhoS = (rhoH && Number.isFinite(w)) ? rhoH / (1 + w/100) : null;
        
        return (
          <View key={i} style={s.puntoBox}>
            <Text style={s.itemTitulo}>Punto {i+1}</Text>
            <View style={s.row}>
              <TextInput style={[s.input,{flex:1}]} keyboardType="decimal-pad" placeholder="Molde+Suelo (g)"
                placeholderTextColor={C.muted} value={p.mh} onChangeText={(v)=>setP(i,'mh',v)}/>
              <View style={{width:6}}/>
              <TextInput style={[s.input,{flex:1}]} keyboardType="decimal-pad" placeholder="M.Húmeda (g)"
                placeholderTextColor={C.muted} value={p.mw} onChangeText={(v)=>setP(i,'mw',v)}/>
              <View style={{width:6}}/>
              <TextInput style={[s.input,{flex:1}]} keyboardType="decimal-pad" placeholder="M.Seca (g)"
                placeholderTextColor={C.muted} value={p.ms} onChangeText={(v)=>setP(i,'ms',v)}/>
            </View>
            {w!==null && (
              <>
                <Text style={[s.itemSub,{marginTop:4, color:C.accent}]}>w = {r(w)} %</Text>
                <Text style={[s.itemSub,{color:C.ok}]}>ρh = {r(rhoH,3)} g/cm³ · ρs = {r(rhoS,3)} g/cm³</Text>
              </>
            )}
          </View>
        );
      })}

      {validos.length >= 3 && (
        <>
          <Text style={s.label}>Curva densidad–humedad</Text>
          <GraficoProctor puntos={validos} ajuste={ajuste} wOpt={wOpt} dsMax={dsMax}/>
        </>
      )}

      {wOpt !== null && (
        <ResultadoBox label="Óptimo Proctor"
          valor={`w_opt = ${r(wOpt)} %`}
          sub={`ρs,máx = ${r(dsMax,3)} g/cm³`} color={C.ok}/>
      )}

      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function GraficoProctor({ puntos, ajuste, wOpt, dsMax }) {
  const W=320, H=200, pad=32;
  const xs = puntos.map(p=>p.w);
  const ys = puntos.map(p=>p.ds);
  if (wOpt!==null) { xs.push(wOpt); ys.push(dsMax); }
  const xMin = Math.min(...xs)-1, xMax = Math.max(...xs)+1;
  const yMin = Math.min(...ys)-0.02, yMax = Math.max(...ys)+0.02;
  const px = (x) => pad + ((x-xMin)/(xMax-xMin))*(W-2*pad);
  const py = (y) => H-pad - ((y-yMin)/(yMax-yMin))*(H-2*pad);

  const curva = [];
  if (ajuste) {
    const N = 40;
    for (let i=0;i<=N;i++) {
      const x = xMin + (i/N)*(xMax-xMin);
      const y = ajuste.a*x*x + ajuste.b*x + ajuste.c;
      if (y >= yMin && y <= yMax) curva.push(`${px(x)},${py(y)}`);
    }
  }

  return (
    <View style={s.chartBox}>
      <Svg width={W} height={H}>
        {[0,0.25,0.5,0.75,1].map((t,i)=>(
          <Line key={'h'+i} x1={pad} y1={pad+t*(H-2*pad)}
            x2={W-pad} y2={pad+t*(H-2*pad)} stroke={C.border} strokeWidth="0.5"/>
        ))}
        <Line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke={C.border}/>
        <Line x1={pad} y1={pad} x2={pad} y2={H-pad} stroke={C.border}/>
        {curva.length > 1 && (
          <Polyline points={curva.join(' ')} fill="none" stroke={C.accent} strokeWidth="2"/>
        )}
        {puntos.map((p,i)=>(<Circle key={i} cx={px(p.w)} cy={py(p.ds)} r="4" fill={C.ok}/>))}
        {wOpt!==null && (
          <>
            <Line x1={px(wOpt)} y1={py(dsMax)} x2={px(wOpt)} y2={H-pad}
              stroke={C.danger} strokeWidth="1" strokeDasharray="3,3"/>
            <Circle cx={px(wOpt)} cy={py(dsMax)} r="6" fill="none" stroke={C.danger} strokeWidth="2"/>
          </>
        )}
        <SvgText x={W/2} y={H-8} fill={C.muted} fontSize="10" textAnchor="middle">Humedad (%)</SvgText>
        <SvgText x={10} y={H/2} fill={C.muted} fontSize="10" textAnchor="middle"
          transform={`rotate(-90 10 ${H/2})`}>ρs (g/cm³)</SvgText>
      </Svg>
      <Text style={[s.itemSub,{textAlign:'center',marginTop:4}]}>
        ⬤ Puntos   ━ Ajuste cuadrático   ◯ Óptimo
      </Text>
    </View>
  );
}

function CalcConoArena({ muestras, guardarEnsayo }) {
  const [fechaProd, setFechaProd] = useState(hoy());
  const [cod,setCod]=useState(''); const [obs,setObs]=useState('');
  const [rhoArena,setRhoArena]=useState('1.47');
  
  const [arenaPozo,setArenaPozo]=useState('');
  const [remanentePozo,setRemanentePozo]=useState('');
  const [conoArena,setConoArena]=useState('');
  const [remanenteCono,setRemanenteCono]=useState('');
  
  const [mHumeda,setMHumeda]=useState('');
  const [mSeca,setMSeca]=useState('');
  
  const [retenido,setRetenido]=useState('');
  const [rhoRetenido,setRhoRetenido]=useState('');
  const [rhoLab,setRhoLab]=useState('');

  // Cálculos
  const rA=num(rhoArena);
  const AP=num(arenaPozo), RP=num(remanentePozo), CA=num(conoArena), RC=num(remanenteCono);
  const MH=num(mHumeda), MS=num(mSeca);
  const R=num(retenido), RR=num(rhoRetenido), RL=num(rhoLab);

  const ok = Number.isFinite(AP) && Number.isFinite(RP) && Number.isFinite(CA) && Number.isFinite(RC) && Number.isFinite(MH) && Number.isFinite(MS) && Number.isFinite(rA) && rA > 0;
  
  const difPozo = ok ? (AP - RP) : null;
  const difCono = ok ? (CA - RC) : null;
  const arenaUsada = (difPozo !== null && difCono !== null) ? (difPozo - difCono) : null;
  
  const vHoyo = (arenaUsada !== null && rA > 0) ? (arenaUsada / rA) : null;
  
  const w = (ok && MS > 0) ? ((MH - MS) / MS) * 100 : null;
  const rhoH = (vHoyo && MH) ? (MH / vHoyo) : null;
  const rhoS_Pasa = (rhoH && Number.isFinite(w)) ? (rhoH / (1 + w/100)) : null;
  
  // Corrección por retenido en 3/4
  const pctRet = (Number.isFinite(R) && Number.isFinite(MH) && MH > 0) ? (R / MH) * 100 : 0;
  const aplicarCorreccion = pctRet > 15 && Number.isFinite(RR) && RR > 0 && Number.isFinite(RL) && RL > 0;
  
  const rhoS = aplicarCorreccion
    ? 100 / ( (pctRet / RR) + ((100 - pctRet) / RL) )
    : rhoS_Pasa;
  const pctCompactacion = (rhoS !== null && Number.isFinite(RL) && RL > 0) ? (rhoS / RL) * 100 : null;

  const guardar = () => {
    if (!ok) return Alert.alert('Datos incompletos','Verificá todos los pesos.');
    guardarEnsayo({
      tipo:'Cono de arena', muestra:cod||'s/c',
      entradas:`Arena usada: ${r(arenaUsada,0)}g · Vol: ${r(vHoyo,1)} cm³ · Hum: ${r(w,1)}%`,
      resultado:`ρs_campo=${r(rhoS,3)} g/cm³`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅','Cono de arena guardado.');
    setArenaPozo(''); setRemanentePozo(''); setConoArena(''); setRemanenteCono(''); setMHumeda(''); setMSeca(''); setRetenido(''); setRhoRetenido(''); setRhoLab(''); setObs('');
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Cono de arena · Densidad in situ</Text>
      
      <Text style={s.label}>Fecha de Producción</Text>
      <TextInput style={s.input} placeholder="AAAA-MM-DD" 
        placeholderTextColor={C.muted} value={fechaProd} onChangeText={setFechaProd}/>

      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>

      <Text style={s.label}>Densidad de la arena (g/cm³)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" value={rhoArena} onChangeText={setRhoArena} placeholder="1.47" placeholderTextColor={C.muted}/>

      <Text style={[s.label, {marginTop: 15, color: C.accent}]}>1. Arena</Text>
      <View style={s.row}>
        <View style={{flex:1}}>
          <Text style={s.label}>Arena en pozo (g)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 7000" value={arenaPozo} onChangeText={setArenaPozo} placeholderTextColor={C.muted}/>
        </View>
        <View style={{width:10}}/>
        <View style={{flex:1}}>
          <Text style={s.label}>Remanente en pozo (g)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 2800" value={remanentePozo} onChangeText={setRemanentePozo} placeholderTextColor={C.muted}/>
        </View>
      </View>

      <View style={[s.row, {marginTop: 10}]}>
        <View style={{flex:1}}>
          <Text style={s.label}>Cono de arena (g)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 2500" value={conoArena} onChangeText={setConoArena} placeholderTextColor={C.muted}/>
        </View>
        <View style={{width:10}}/>
        <View style={{flex:1}}>
          <Text style={s.label}>Remanente en cono (g)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 750" value={remanenteCono} onChangeText={setRemanenteCono} placeholderTextColor={C.muted}/>
        </View>
      </View>

      {arenaUsada !== null && (
        <Text style={[s.itemSub, {color: C.ok, marginTop: 4, fontWeight: 'bold'}]}>
          Diferencia (Arena usada en el pozo): {r(arenaUsada, 0)} g
        </Text>
      )}

      <Text style={[s.label, {marginTop: 15, color: C.accent}]}>2. Humedad</Text>
      <View style={s.row}>
        <View style={{flex:1}}>
          <Text style={s.label}>Masa Húmeda (g)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 3500" value={mHumeda} onChangeText={setMHumeda} placeholderTextColor={C.muted}/>
        </View>
        <View style={{width:10}}/>
        <View style={{flex:1}}>
          <Text style={s.label}>Masa Seca (g)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 3200" value={mSeca} onChangeText={setMSeca} placeholderTextColor={C.muted}/>
        </View>
      </View>

      {w !== null && (
        <Text style={[s.itemSub, {color: C.ok, marginTop: 4, fontWeight: 'bold'}]}>
          % Humedad: {r(w, 2)} %
        </Text>
      )}

      <Text style={[s.label, {marginTop: 15, color: C.accent}]}>3. Corrección por Retenido 3/4 (Opcional)</Text>
      <Text style={s.label}>Peso retenido en tamiz 3/4" (g)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 150" value={retenido} onChangeText={setRetenido} placeholderTextColor={C.muted}/>

      <Text style={s.label}>Peso específico del material retenido 3/4" (g/cm³)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 2.824" value={rhoRetenido} onChangeText={setRhoRetenido} placeholderTextColor={C.muted}/>

      <Text style={s.label}>Densidad Seca de Laboratorio (Proctor) (g/cm³)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 2.257" value={rhoLab} onChangeText={setRhoLab} placeholderTextColor={C.muted}/>

      <ResultadoBox label="Densidad Seca de Campo"
        valor={rhoS!==null?`${r(rhoS,3)} g/cm³`:'—'}
        sub={aplicarCorreccion ? `Corregida por retenido (${r(pctRet,1)}%)` : `Sin corrección (${r(pctRet,1)}% retenido)`}
        color={C.ok}/>
      {pctCompactacion !== null && (
        <View style={[s.resultado, { borderColor: C.accent2, marginTop: 12 }]}>
          <Text style={s.resultadoLabel}>% de Compactación (Campo / Proctor)</Text>
          <Text style={[s.resultadoValor, { color: C.accent2, fontSize: 26 }]}>
            {r(pctCompactacion, 1)} %
          </Text>
          <Text style={s.itemSub}>
            {rhoS !== null && Number.isFinite(RL) ? `(${r(rhoS, 3)} / ${r(RL, 3)}) × 100` : ''}
          </Text>
        </View>
      )}
      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function CalcCBR({ muestras, guardarEnsayo }) {
  const [fechaProd, setFechaProd] = useState(hoy());
  const [cod,setCod]=useState('');
  const [obs,setObs]=useState('');
  const [piston,setPiston]=useState('19.35');
  const [puntos,setPuntos]=useState(
    Array.from({length:8},()=>({ pen:'', carga:'' }))
  );
  const AREA = num(piston) || 19.35;

  const setP = (i,k,v) => setPuntos((p)=>p.map((it,idx)=>idx===i?{...it,[k]:v}:it));

  const medidos = puntos
    .map(p=>({ pen:num(p.pen), carga:num(p.carga) }))
    .filter(p=>Number.isFinite(p.pen)&&Number.isFinite(p.carga)&&p.pen>=0)
    .map(p=>({ ...p, esf: p.carga/AREA }))
    .sort((a,b)=>a.pen-b.pen);

  const interpol = (mm) => {
    if (medidos.length === 0) return null;
    if (mm <= medidos[0].pen) return medidos[0].esf;
    if (mm >= medidos[medidos.length-1].pen) return medidos[medidos.length-1].esf;
    for (let i=0;i<medidos.length-1;i++) {
      if (medidos[i].pen <= mm && mm <= medidos[i+1].pen) {
        const t = (mm - medidos[i].pen) / (medidos[i+1].pen - medidos[i].pen);
        return medidos[i].esf * (1-t) + medidos[i+1].esf * t;
      }
    }
    return null;
  };

  const esf25 = interpol(2.5);
  const esf50 = interpol(5.0);
  const cbr25 = esf25!==null ? (esf25/70.3)*100 : null;
  const cbr50 = esf50!==null ? (esf50/105.5)*100 : null;
  let cbrFinal = null;
  if (cbr25!==null && cbr50!==null) cbrFinal = cbr25 >= cbr50 ? cbr25 : cbr50;
  else cbrFinal = cbr25 ?? cbr50;

  const guardar = () => {
    if (medidos.length < 3) return Alert.alert('Faltan datos','Cargá al menos 3 puntos.');
    if (cbrFinal===null) return Alert.alert('Faltan datos','Necesito lectura cerca de 2.5 y/o 5.0 mm.');
    guardarEnsayo({
      tipo:'CBR', muestra:cod||'s/c',
      entradas:`${medidos.length} puntos · Área pistón ${AREA} cm²`,
      resultado:`CBR = ${r(cbrFinal)} %` +
        (cbr25!==null?` · 2.5mm: ${r(cbr25)}%`:'') +
        (cbr50!==null?` · 5.0mm: ${r(cbr50)}%`:''),
      observaciones: obs.trim(),
    });
    Alert.alert('✅','CBR guardado.');
    setObs('');
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>CBR (California Bearing Ratio)</Text>
      <Text style={s.formula}>Esf = Carga/Área · CBR = Esf/Esf_patrón × 100</Text>
      <Text style={[s.itemSub,{marginBottom:6}]}>
        Patrón: 70.3 kg/cm² a 2.5 mm · 105.5 kg/cm² a 5.0 mm
      </Text>

      <Text style={s.label}>Fecha de Producción</Text>
      <TextInput style={s.input} placeholder="AAAA-MM-DD" 
        placeholderTextColor={C.muted} value={fechaProd} onChangeText={setFechaProd}/>

      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>

      <Text style={s.label}>Área del pistón (cm²)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad"
        placeholderTextColor={C.muted} value={piston} onChangeText={setPiston}/>

      <Text style={s.label}>Puntos (Penetración mm · Carga kg)</Text>
      {puntos.map((p,i)=>{
        const pen=num(p.pen), car=num(p.carga);
        const okP = Number.isFinite(pen)&&Number.isFinite(car);
        const esf = okP ? car/AREA : null;
        return (
          <View key={i} style={s.puntoBox}>
            <Text style={s.itemTitulo}>P{i+1}</Text>
            <View style={s.row}>
              <TextInput style={[s.input,{flex:1}]} keyboardType="decimal-pad" placeholder="Pen (mm)"
                placeholderTextColor={C.muted} value={p.pen} onChangeText={(v)=>setP(i,'pen',v)}/>
              <View style={{width:6}}/>
              <TextInput style={[s.input,{flex:1}]} keyboardType="decimal-pad" placeholder="Carga (kg)"
                placeholderTextColor={C.muted} value={p.carga} onChangeText={(v)=>setP(i,'carga',v)}/>
            </View>
            {esf!==null && (
              <Text style={[s.itemSub,{marginTop:4,color:C.accent}]}>Esf = {r(esf,2)} kg/cm²</Text>
            )}
          </View>
        );
      })}

      {medidos.length >= 3 && (
        <>
          <Text style={s.label}>Curva esfuerzo–penetración</Text>
          <GraficoCBR medidos={medidos}/>
        </>
      )}

      {(cbr25!==null || cbr50!==null) && (
        <ResultadoBox label="CBR"
          valor={cbrFinal!==null?`${r(cbrFinal)} %`:'—'}
          sub={`2.5 mm: ${cbr25!==null?r(cbr25)+'%':'—'} · 5.0 mm: ${cbr50!==null?r(cbr50)+'%':'—'}`}
          color={C.ok}/>
      )}

      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function GraficoCBR({ medidos }) {
  const W=320, H=200, pad=32;
  const xs = medidos.map(p=>p.pen);
  const ys = medidos.map(p=>p.esf);
  const xMax = Math.max(12.5, Math.max(...xs)+0.5);
  const yMax = Math.max(...ys)*1.1;
  const px = (x)=> pad + (x/xMax)*(W-2*pad);
  const py = (y)=> H-pad - (y/yMax)*(H-2*pad);
  const poly = medidos.map(p=>`${px(p.pen)},${py(p.esf)}`).join(' ');

  return (
    <View style={s.chartBox}>
      <Svg width={W} height={H}>
        {[2.5,5,7.5,10,12.5].map((x,i)=>(
          <Line key={'v'+i} x1={px(x)} y1={pad} x2={px(x)} y2={H-pad}
            stroke={C.border} strokeWidth="0.5" strokeDasharray="2,3"/>
        ))}
        <Line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke={C.border}/>
        <Line x1={pad} y1={pad} x2={pad} y2={H-pad} stroke={C.border}/>
        <Polyline points={poly} fill="none" stroke={C.accent} strokeWidth="2"/>
        {medidos.map((p,i)=>(<Circle key={i} cx={px(p.pen)} cy={py(p.esf)} r="3.5" fill={C.ok}/>))}
        <Line x1={px(2.5)} y1={pad} x2={px(2.5)} y2={H-pad} stroke={C.danger} strokeDasharray="3,3"/>
        <Line x1={px(5)}   y1={pad} x2={px(5)}   y2={H-pad} stroke={C.danger} strokeDasharray="3,3"/>
        <SvgText x={W/2} y={H-8} fill={C.muted} fontSize="10" textAnchor="middle">Penetración (mm)</SvgText>
        <SvgText x={10} y={H/2} fill={C.muted} fontSize="10" textAnchor="middle"
          transform={`rotate(-90 10 ${H/2})`}>Esfuerzo (kg/cm²)</SvgText>
      </Svg>
      <Text style={[s.itemSub,{textAlign:'center',marginTop:4}]}>
        Líneas rojas: 2.5 mm y 5.0 mm
      </Text>
    </View>
  );
}

function CalcAASHTO({ muestras, guardarEnsayo }) {
  const [cod,setCod]=useState(''); const [obs,setObs]=useState('');
  const [p200,setP200]=useState('');
  const [p40,setP40]=useState('');
  const [p10,setP10]=useState('');
  const [ll,setLl]=useState('');
  const [lp,setLp]=useState('');

  const F200=num(p200), F40=num(p40), F10=num(p10);
  const LL=num(ll), LP=num(lp);
  const IP = (Number.isFinite(LL)&&Number.isFinite(LP)) ? LL-LP : null;

  const res = Number.isFinite(F200)
    ? clasificarAASHTO({ pasa200:F200, pasa40:F40, pasa10:F10, LL, IP })
    : null;

  const guardar = () => {
    if (!res) return Alert.alert('Faltan datos','Ingresá al menos el % pasa #200.');
    guardarEnsayo({
      tipo:'Clasificación AASHTO', muestra:cod||'s/c',
      entradas:`#200=${F200}%${Number.isFinite(F40)?` · #40=${F40}%`:''}${Number.isFinite(F10)?` · #10=${F10}%`:''}${Number.isFinite(LL)?` · LL=${LL}% · LP=${LP}%`:''}`,
      resultado:`${res.grupo} · IG=${res.IG} · ${res.desc}`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅','Clasificación guardada.');
    setObs('');
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Clasificación AASHTO M 145</Text>
      <Text style={s.formula}>Grupo + Índice de Grupo (IG)</Text>

      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>

      <Text style={s.label}>% pasa tamiz #200 (obligatorio)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 55"
        value={p200} onChangeText={setP200} placeholderTextColor={C.muted}/>

      <View style={s.row}>
        <View style={{flex:1}}>
          <Text style={s.label}>% pasa #40</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 70"
            value={p40} onChangeText={setP40} placeholderTextColor={C.muted}/>
        </View>
        <View style={{width:8}}/>
        <View style={{flex:1}}>
          <Text style={s.label}>% pasa #10</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 90"
            value={p10} onChangeText={setP10} placeholderTextColor={C.muted}/>
        </View>
      </View>

      <View style={s.row}>
        <View style={{flex:1}}>
          <Text style={s.label}>LL (%)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 42"
            value={ll} onChangeText={setLl} placeholderTextColor={C.muted}/>
        </View>
        <View style={{width:8}}/>
        <View style={{flex:1}}>
          <Text style={s.label}>LP (%)</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 22"
            value={lp} onChangeText={setLp} placeholderTextColor={C.muted}/>
        </View>
      </View>

      {IP!==null && (
        <Text style={[s.itemSub,{marginTop:8, color:C.accent}]}>
          IP = {r(IP)} % · Clasif. plasticidad: {clasifIP(IP)}
        </Text>
      )}

      {res && (
        <>
          <ResultadoBox label="Clasificación AASHTO"
            valor={res.grupo} sub={res.desc} color={C.ok}/>
          <ResultadoBox label="Índice de Grupo (IG)"
            valor={String(res.IG)} sub="0 (óptimo) a 20 (muy pobre)" color={C.accent2}/>
        </>
      )}
      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function CalcDosif({ muestras, guardarEnsayo }) {
  const [peso,setPeso]=useState(''); const [pct,setPct]=useState('');
  const [tipo,setTipo]=useState('Cemento'); const [wOpt,setWOpt]=useState('');
  const [cod,setCod]=useState(''); const [obs,setObs]=useState('');
  const P=num(peso), PC=num(pct), WO=num(wOpt);
  const ok = Number.isFinite(P)&&Number.isFinite(PC)&&P>0&&PC>0;
  const estab = ok ? (P*PC)/100 : null;
  const total = ok ? P + estab : null;
  const agua = ok&&Number.isFinite(WO) ? (total*WO)/100 : null;
  const guardar = () => {
    if (!ok) return Alert.alert('Datos inválidos','Peso y % deben ser > 0.');
    guardarEnsayo({
      tipo:`Dosificación con ${tipo}`, muestra:cod||'s/c',
      entradas:`Suelo=${P} kg · ${tipo}=${PC}%${Number.isFinite(WO)?` · w_opt=${WO}%`:''}`,
      resultado:`${tipo}: ${r(estab)} kg · Total: ${r(total)} kg${agua!==null?` · Agua: ${r(agua)} L`:''}`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅','Ensayo guardado.');
    setPeso(''); setPct(''); setWOpt(''); setObs('');
  };
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Dosificación de estabilizado</Text>
      <Text style={s.formula}>Est = P·%/100 · Agua = Total·w_opt/100</Text>
      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>
      <Text style={s.label}>Estabilizante</Text>
      <View style={s.chipsWrap}>
        {['Cemento','Cal','Cemento+Cal','Emulsión'].map((t)=>(
          <TouchableOpacity key={t} style={[s.chip, tipo===t && s.chipActivo]}
            onPress={()=>setTipo(t)}>
            <Text style={[s.chipText, tipo===t && { color:'#1A1004' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.label}>Peso suelo seco (kg)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 100"
        placeholderTextColor={C.muted} value={peso} onChangeText={setPeso}/>
      <Text style={s.label}>% estabilizante</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 5"
        placeholderTextColor={C.muted} value={pct} onChangeText={setPct}/>
      <Text style={s.label}>Humedad óptima w_opt % (opcional)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 11.5"
        placeholderTextColor={C.muted} value={wOpt} onChangeText={setWOpt}/>
      <ResultadoBox label={`${tipo} necesario`} valor={estab!==null?`${r(estab)} kg`:'—'}
        sub={total!==null?`Mezcla total seca: ${r(total)} kg`:null} color={C.ok}/>
      {agua!==null && (
        <ResultadoBox label="Agua aproximada" valor={`${r(agua)} L`}
          sub="Sobre mezcla seca total" color={C.accent2}/>
      )}
      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function CalcGranulo({ muestras, guardarEnsayo }) {
  const [cod, setCod] = useState('');
  const [obs, setObs] = useState('');
  const [tipoMezcla, setTipoMezcla] = useState('BSM/Asfalto espumado');
  const [pesoSeco, setPesoSeco] = useState('');
  const [tamices, setTamices] = useState(
    SERIES_TAMICES['BSM/Asfalto espumado'].map(t => ({ ...t, peso: '' }))
  );
  const [nuevoTamizMm, setNuevoTamizMm] = useState('');
  const [mostrarNuevoTamiz, setMostrarNuevoTamiz] = useState(false);

  const cambiarTipo = (nuevoTipo) => {
    setTipoMezcla(nuevoTipo);
    setTamices(SERIES_TAMICES[nuevoTipo].map(t => ({ ...t, peso: '' })));
    setMostrarNuevoTamiz(false);
  };

  const setPeso = (idx, valor) => {
    setTamices((prev) => prev.map((t, i) => i === idx ? { ...t, peso: valor } : t));
  };

  const confirmarNuevoTamiz = () => {
    const n = parseFloat(nuevoTamizMm.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Valor inválido', 'Ingresá una abertura en mm mayor a 0.');
      return;
    }
    setTamices((prev) => [
      ...prev,
      { nombre: n >= 1 ? `${n}mm` : `#${n}`, mm: n, peso: '', custom: true }
    ].sort((a, b) => b.mm - a.mm));
    setNuevoTamizMm('');
    setMostrarNuevoTamiz(false);
  };

  const quitarTamiz = (idx) => {
    setTamices((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetSerie = () => {
    setTamices(SERIES_TAMICES[tipoMezcla].map(t => ({ ...t, peso: '' })));
    setMostrarNuevoTamiz(false);
  };

  const P = num(pesoSeco);
  const okPeso = Number.isFinite(P) && P > 0;
  const pesosNum = tamices.map(t => Number.isFinite(num(t.peso)) ? num(t.peso) : 0);
  const sumaRetenidos = pesosNum.reduce((a, b) => a + b, 0);
  const diferencia = okPeso ? P - sumaRetenidos : 0;
  const hayError = okPeso && Math.abs(diferencia) > 0.01;

  const pasaPorTamiz = [];
  let acumulado = 0;
  tamices.forEach((t, i) => {
    acumulado += pesosNum[i];
    const pasa = okPeso ? ((P - acumulado) / P) * 100 : 0;
    pasaPorTamiz.push(Math.max(0, Math.min(100, pasa)));
  });

  const idx200 = tamices.findIndex(t => t.nombre === '#200');
  const pasa200 = idx200 >= 0 ? pasaPorTamiz[idx200] : null;

  const guardar = () => {
    if (!okPeso) return Alert.alert('Falta peso', 'Ingresá el peso seco total.');
    if (tamices.every(t => !num(t.peso))) return Alert.alert('Faltan datos', 'Cargá al menos un peso.');
    
    const datosTamices = tamices.map((t, i) => `${t.nombre}=${pesosNum[i]}g`);
    const datosPasa = tamices.map((t, i) => `${t.nombre}=${r(pasaPorTamiz[i], 1)}%`);
    
    guardarEnsayo({
      tipo: 'Granulometría',
      muestra: cod || 's/c',
      entradas: `Tipo: ${tipoMezcla} · Peso seco: ${P}g · Tamices: ${datosTamices.join(' · ')}`,
      resultado: `${pasa200 !== null ? `%Pasa #200 = ${r(pasa200, 1)}%` : 'Sin #200'}${hayError ? ` · ⚠️ Diferencia: ${r(diferencia, 1)}g` : ''}`,
      detalle: `%Pasa: ${datosPasa.join(' · ')}`,
      observaciones: obs.trim(),
    });
    Alert.alert('✅', 'Granulometría guardada.');
    setPesoSeco('');
    setObs('');
    resetSerie();
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Granulometría</Text>
      <Text style={s.formula}>%Pasa = (P − ΣRet) / P × 100</Text>

      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>

      <Text style={s.label}>Tipo de mezcla</Text>
      <View style={s.chipsWrap}>
        {Object.keys(SERIES_TAMICES).map((t) => (
          <TouchableOpacity key={t} style={[s.chip, tipoMezcla === t && s.chipActivo]}
            onPress={() => cambiarTipo(t)}>
            <Text style={[s.chipText, tipoMezcla === t && { color: '#1A1004' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>Peso seco total (g)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej. 1000"
        placeholderTextColor={C.muted} value={pesoSeco} onChangeText={setPesoSeco}/>

      <Text style={s.label}>Pesos retenidos por tamiz (g)</Text>
      {tamices.map((t, i) => (
        <View key={`${t.nombre}-${i}`} style={s.puntoBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.itemTitulo, { flex: 1 }]}>{t.nombre}</Text>
            {t.custom && (
              <TouchableOpacity onPress={() => quitarTamiz(i)}>
                <Text style={{ color: C.danger, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor={C.muted}
              value={t.peso}
              onChangeText={(v) => setPeso(i, v)}
            />
            <Text style={[s.itemSub, { marginLeft: 8, minWidth: 80, textAlign: 'right', color: C.accent }]}>
              {okPeso ? `→ ${r(pasaPorTamiz[i], 1)}%` : '—'}
            </Text>
          </View>
        </View>
      ))}

      {!mostrarNuevoTamiz ? (
        <TouchableOpacity style={[s.btnGhost, { marginTop: 8 }]} onPress={() => setMostrarNuevoTamiz(true)}>
          <Text style={s.btnGhostText}>+ Agregar tamiz personalizado</Text>
        </TouchableOpacity>
      ) : (
        <View style={[s.puntoBox, { borderColor: C.accent }]}>
          <Text style={[s.itemTitulo, { marginBottom: 8 }]}>Nuevo tamiz (mm)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              keyboardType="decimal-pad"
              placeholder="Ej. 6.30"
              placeholderTextColor={C.muted}
              value={nuevoTamizMm}
              onChangeText={setNuevoTamizMm}
              autoFocus
            />
            <TouchableOpacity style={[s.btnGhost, { marginLeft: 8, paddingHorizontal: 12 }]}
              onPress={() => { setMostrarNuevoTamiz(false); setNuevoTamizMm(''); }}>
              <Text style={s.btnGhostText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnPrimary, { marginLeft: 8, marginTop: 0, paddingHorizontal: 16, paddingVertical: 12 }]}
              onPress={confirmarNuevoTamiz}>
              <Text style={s.btnPrimaryText}>✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={[s.btnGhost, { marginTop: 8 }]} onPress={resetSerie}>
        <Text style={s.btnGhostText}>🔄 Resetear serie ({tipoMezcla})</Text>
      </TouchableOpacity>

      {okPeso && (
        <View style={[s.resultado, {
          borderColor: hayError ? C.danger : C.ok,
          marginTop: 16
        }]}>
          <Text style={s.resultadoLabel}>Suma de retenidos</Text>
          <Text style={[s.resultadoValor, { color: hayError ? C.danger : C.ok, fontSize: 18 }]}>
            {r(sumaRetenidos, 1)} g / {r(P, 1)} g
          </Text>
          {hayError ? (
            <Text style={[s.itemSub, { color: C.danger, fontWeight: '700', marginTop: 4 }]}>
              ⚠️ {diferencia > 0 ? 'Faltan' : 'Sobran'} {r(Math.abs(diferencia), 1)} g ({r((Math.abs(diferencia) / P) * 100, 1)}%)
            </Text>
          ) : (
            <Text style={[s.itemSub, { color: C.ok, fontWeight: '700', marginTop: 4 }]}>
              ✅ Coincide perfecto
            </Text>
          )}
        </View>
      )}

      {tamices.length > 0 && pasaPorTamiz.length > 0 && (
        <>
          <Text style={s.label}>Curva granulométrica</Text>
          <GraficoGranulo tamices={tamices} pasaPorTamiz={pasaPorTamiz} />
        </>
      )}

      {pasa200 !== null && (
        <ResultadoBox label="% Pasa #200"
          valor={`${r(pasa200, 1)} %`}
          sub={`${tamices.length} tamices cargados`}
          color={C.ok}/>
      )}

      <ObsInput value={obs} onChange={setObs}/>
      <BotonGuardar onPress={guardar}/>
    </View>
  );
}

function GraficoGranulo({ tamices, pasaPorTamiz }) {
  const W = 340, H = 240, pad = 45;
  
  const puntos = tamices
    .map((t, i) => ({ mm: t.mm, pasa: pasaPorTamiz[i], nombre: t.nombre }))
    .filter(p => p.mm > 0)
    .sort((a, b) => a.mm - b.mm);

  if (puntos.length < 2) {
    return (
      <View style={s.chartBox}>
        <Text style={s.itemSub}>Cargá al menos 2 tamices para ver la curva</Text>
      </View>
    );
  }

  const mmMin = Math.min(...puntos.map(p => p.mm));
  const mmMax = Math.max(...puntos.map(p => p.mm));
  const logMin = Math.log10(mmMin) - 0.1;
  const logMax = Math.log10(mmMax) + 0.1;

  const px = (mm) => {
    const log = Math.log10(mm);
    return pad + ((log - logMin) / (logMax - logMin)) * (W - 2 * pad);
  };
  const py = (pasa) => H - pad - (pasa / 100) * (H - 2 * pad);
  const puntosLine = puntos.map(p => `${px(p.mm)},${py(p.pasa)}`).join(' ');

  return (
    <View style={s.chartBox}>
      <Svg width={W} height={H}>
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v, i) => (
          <Line key={`h${i}`} x1={pad} y1={py(v)} x2={W - pad} y2={py(v)}
            stroke={C.border} strokeWidth="0.5" strokeDasharray="2,3"/>
        ))}
        {[0.01, 0.1, 1, 10, 100].map((d, i) => {
          const log = Math.log10(d);
          if (log < logMin || log > logMax) return null;
          return (
            <Line key={`v${i}`} x1={px(d)} y1={pad} x2={px(d)} y2={H - pad}
              stroke={C.border} strokeWidth="0.5" strokeDasharray="2,3"/>
          );
        })}
        <Line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={C.text} strokeWidth="1"/>
        <Line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke={C.text} strokeWidth="1"/>
        <Polyline points={puntosLine} fill="none" stroke={C.accent} strokeWidth="2.5"/>
        {puntos.map((p, i) => (
          <Circle key={i} cx={px(p.mm)} cy={py(p.pasa)} r="4" fill={C.ok}/>
        ))}
        {puntos.map((p, i) => (
          <SvgText key={`x${i}`} x={px(p.mm)} y={H - pad + 12}
            fill={C.muted} fontSize="8" textAnchor="middle">
            {p.mm >= 1 ? p.mm.toFixed(1) : p.mm.toFixed(3)}
          </SvgText>
        ))}
        {[0, 25, 50, 75, 100].map((v, i) => (
          <SvgText key={`y${i}`} x={pad - 6} y={py(v) + 3}
            fill={C.muted} fontSize="9" textAnchor="end">
            {v}
          </SvgText>
        ))}
        <SvgText x={12} y={H / 2} fill={C.muted} fontSize="10" textAnchor="middle"
          transform={`rotate(-90 12 ${H / 2})`}>% Pasa</SvgText>
        <SvgText x={W / 2} y={H - 4} fill={C.muted} fontSize="9" textAnchor="middle">
          Abertura tamiz (mm)
        </SvgText>
      </Svg>
      <Text style={[s.itemSub, { textAlign: 'center', marginTop: 4 }]}>
        ⬤ Puntos   ━ Curva   (escala log en X)
      </Text>
    </View>
  );
}
function CalcITS({ muestras, guardarEnsayo, borrarEnsayo, ensayoAEditar, setEnsayoAEditar }) {
  const [cod, setCod] = useState('');
  const [fechaProd, setFechaProd] = useState(hoy());
  const [obs, setObs] = useState('');
  const [produccion, setProduccion] = useState('');
  const [factorAro, setFactorAro] = useState('');
  const [tipoBSM, setTipoBSM] = useState('BSM 1');
  const [humedadControl, setHumedadControl] = useState('');
  
  // Estado de las 6 probetas
  const [probetas, setProbetas] = useState(
    Array.from({ length: 6 }, () => ({
      pDesmoldado: '',
      pCurado: '',
      d1: '',
      d2: '',
      h1: '',
      h2: '',
    }))
  );

  // Estado de lecturas (arrancan vacías, se asignan a las 3 secas y 3 húmedas)
  const [lecturas, setLecturas] = useState({
    secas: ['', '', ''],
    humedas: ['', '', ''],
  });
  
  // Estado para los pesos embebidos de las 3 probetas húmedas
  const [pesoEmbebido, setPesoEmbebido] = useState(['', '', '']);
  useEffect(() => {
    if (ensayoAEditar && ensayoAEditar.datosGuardados) {
      const d = ensayoAEditar.datosGuardados;
      setProbetas(d.probetas || []);
      setLecturas(d.lecturas || { secas: ['', '', ''], humedas: ['', '', ''] });
      setPesoEmbebido(d.pesoEmbebido || ['', '', '']);
      setTipoBSM(d.tipoBSM || 'BSM 1');
      setFactorAro(d.factorAro || '');
      setProduccion(d.produccion || '');
      setCod(d.cod || '');
      setObs(d.obs || '');
      setHumedadSeca(d.humedadSeca || '');
      setHumedadHumeda(d.humedadHumeda || '');
      setEnsayoAEditar(null); // Limpiamos para que no vuelva a cargar
    }
  }, [ensayoAEditar]);
  const [humedadSeca, setHumedadSeca] = useState('');
  const [humedadHumeda, setHumedadHumeda] = useState('');

  const setP = (idx, key, val) => {
    setProbetas((prev) => prev.map((p, i) => i === idx ? { ...p, [key]: val } : p));
  };

  const setLec = (grupo, idx, val) => {
    setLecturas((prev) => {
      const arr = [...prev[grupo]];
      arr[idx] = val;
      return { ...prev, [grupo]: arr };
    });
  };

  const setPEmb = (idx, val) => {
    setPesoEmbebido((prev) => {
      const arr = [...prev];
      arr[idx] = val;
      return arr;
    });
  };

  // Cálculos de probetas
  const probetasCalc = probetas.map((p, idx) => {
    const pd = num(p.pDesmoldado);
    const pc = num(p.pCurado);
    const d1 = num(p.d1);
    const d2 = num(p.d2);
    const h1 = num(p.h1);
    const h2 = num(p.h2);

    const ok = Number.isFinite(pc) && pc > 0 && Number.isFinite(d1) && Number.isFinite(d2) && Number.isFinite(h1) && Number.isFinite(h2);
    const dProm = (d1 + d2) / 2;
    const hProm = (h1 + h2) / 2;
    const densidad = ok ? (4 * Math.pow(10, 6) * pc) / (Math.PI * dProm * dProm * hProm) : null;
    const humedad = (Number.isFinite(pd) && Number.isFinite(pc) && pc > 0) ? ((pd - pc) / pc) * 100 : null;

    return { ...p, idx, dProm, hProm, densidad, humedad, ok };
  });

  const validas = probetasCalc.filter(p => p.ok);
  const densidades = validas.map(p => p.densidad);
  const n = densidades.length;
  
  const rhoMedia = n > 0 ? densidades.reduce((a, b) => a + b, 0) / n : null;
  
  let desvEst = null;
  if (n > 1) {
    const sumCuad = densidades.reduce((a, b) => a + Math.pow(b - rhoMedia, 2), 0);
    desvEst = Math.sqrt(sumCuad / (n - 1));
  }

  // Ordenar de mayor a menor
  const ordenadas = [...validas].sort((a, b) => b.densidad - a.densidad);
  const top3 = ordenadas.slice(0, 3); // Van a húmedo
  const bottom3 = ordenadas.slice(3, 6); // Van a seco

  const factor = num(factorAro);
  const okFactor = Number.isFinite(factor) && factor > 0;

  // Cálculos de ITS
  const calcularITS = (probeta, lecturaStr) => {
    const lec = num(lecturaStr);
    if (!okFactor || !Number.isFinite(lec) || lec <= 0 || !probeta) return null;
    
    const D = probeta.dProm;
    const H = probeta.hProm;
    
    // Fórmula del Excel: (2 * ((lectura * factor) / 100) * 1000000) / (PI * H * D)
    const itsKpa = (2 * ((lec * factor) / 100) * 1000000) / (Math.PI * H * D);
    
    return { itsKpa };
  };

  const resultadosSecas = bottom3.map((p, i) => calcularITS(p, lecturas.secas[i]));
  const resultadosHumedas = top3.map((p, i) => calcularITS(p, lecturas.humedas[i]));

  const itsSecoProm = resultadosSecas.every(r => r !== null) 
    ? resultadosSecas.reduce((a, b) => a + b.itsKpa, 0) / 3 
    : null;
  const itsHumProm = resultadosHumedas.every(r => r !== null) 
    ? resultadosHumedas.reduce((a, b) => a + b.itsKpa, 0) / 3 
    : null;

  // Evaluar exigencia
  const exigencia = {
    'BSM 1': { seco: 225, humedo: 125 },
    'BSM 2': { seco: 175, humedo: 100 },
  }[tipoBSM];

  const cumpleSeco = itsSecoProm !== null && itsSecoProm > exigencia.seco;
  const cumpleHum = itsHumProm !== null && itsHumProm > exigencia.humedo;

  const guardarParcial = () => {
    if (validas.length < 6) return Alert.alert('Faltan datos', 'Cargá los datos de las 6 probetas completos.');
    if (!okFactor) return Alert.alert('Falta factor', 'Ingresá el factor del aro.');
    if (itsSecoProm === null) return Alert.alert('Faltan lecturas', 'Cargá las lecturas de las probetas secas.');

    guardarEnsayo({
      tipo: 'ITS (Parcial - Faltan Húmedas)',
      muestra: cod || 's/c',
      entradas: `Prod: ${produccion||'s/d'} · Factor Aro: ${factor} kg/div · ρ Media: ${r(rhoMedia,1)} kg/m³`,
      resultado: `ITS Seco: ${r(itsSecoProm,1)} kPa (Pendiente Húmedas)`,
      detalle: `Secas: ${resultadosSecas.map(x=>x?r(x.itsKpa,1):'—').join(', ')}`,
      observaciones: obs.trim(),
      pendienteHumeda: true, // <-- Esta marca nos dirá que falta completar
      datosGuardados: { probetas, lecturas, pesoEmbebido, tipoBSM, factorAro, produccion, cod, obs, humedadSeca, humedadHumeda }
    });
    Alert.alert('✅ Guardado Parcial', 'Las secas quedaron guardadas. Mañana podés buscar este ensayo en Reportes para cargar las húmedas.');
  };

  const guardar = () => {
    if (validas.length < 6) return Alert.alert('Faltan datos', 'Cargá los datos de las 6 probetas completos.');
    if (!okFactor) return Alert.alert('Falta factor', 'Ingresá el factor del aro.');
    if (itsSecoProm === null || itsHumProm === null) return Alert.alert('Faltan lecturas', 'Cargá las 6 lecturas de aro.');

    if (ensayoAEditar) {
      // Si estamos editando uno parcial, borramos el parcial y guardamos el nuevo
      // (en el próximo paso veremos cómo hacerlo bien sin duplicar)
    }
    if (ensayoAEditar && ensayoAEditar.id) { borrarEnsayo(ensayoAEditar.id); }
    setEnsayoAEditar(null);
    
    guardarEnsayo({
      tipo: 'ITS (Asfalto espumado)',

      muestra: cod || 's/c',
      entradas: `Prod: ${produccion||'s/d'} · Factor Aro: ${factor} kg/div · ρ Media: ${r(rhoMedia,1)} kg/m³ · Hum Seca: ${humedadSeca||'—'}% · Hum Húmeda: ${humedadHumeda||'—'}%`,
      resultado: `ITS Seco: ${r(itsSecoProm,1)} kPa ${cumpleSeco?'✅':'❌'} · ITS Húmedo: ${r(itsHumProm,1)} kPa ${cumpleHum?'✅':'❌'} · Exigencia: ${tipoBSM}`,
      detalle: `Secas (${bottom3.map(p=>`#${p.idx+1}:${r(p.densidad,0)}`).join(', ')}): ${resultadosSecas.map(x=>x?r(x.itsKpa,1):'—').join(', ')} | Húmedas (${top3.map(p=>`#${p.idx+1}:${r(p.densidad,0)}`).join(', ')}): ${resultadosHumedas.map(x=>x?r(x.itsKpa,1):'—').join(', ')} | P. Embebidos: ${pesoEmbebido.map(v=>v||'—').join(', ')} g`,
      observaciones: obs.trim(),
      pendienteHumeda: false, // Ya no está pendiente
    });
    
    Alert.alert('✅', 'ITS guardado.');
    
    // LIMPIAR EL FORMULARIO
    setProbetas(Array.from({ length: 6 }, () => ({ pDesmoldado: '', pCurado: '', d1: '', d2: '', h1: '', h2: '' })));
    setLecturas({ secas: ['', '', ''], humedas: ['', '', ''] });
    setPesoEmbebido(['', '', '']);
    setFactorAro('');
    setProduccion('');
    setCod('');
    setObs('');
    setHumedadSeca('');
    setHumedadHumeda('');
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>ITS · Tracción Indirecta (Asfalto)</Text>

      <Text style={s.label}>Fecha de Producción</Text>
      <TextInput style={s.input} placeholder="AAAA-MM-DD" 
        placeholderTextColor={C.muted} value={fechaProd} onChangeText={setFechaProd}/>

      <Text style={s.label}>Muestra</Text>
      <SelectorMuestra muestras={muestras} valor={cod} setValor={setCod}/>

      <Text style={s.label}>Producción / Moldeo</Text>
      <TextInput style={s.input} placeholder="Ej: Prod 1" value={produccion} onChangeText={setProduccion} placeholderTextColor={C.muted}/>

      <Text style={s.label}>Factor del aro (kg/div)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Ej: 0.25" value={factorAro} onChangeText={setFactorAro} placeholderTextColor={C.muted}/>

      <Text style={[s.label, {marginTop: 20}]}>1. Datos de Moldeo (6 probetas)</Text>
      {probetas.map((p, i) => (
        <View key={i} style={s.puntoBox}>
          <Text style={s.itemTitulo}>Probeta {i+1}</Text>
          
          <View style={[s.row, {marginTop: 4}]}>
            <TextInput style={[s.input, {flex:1}]} placeholder="P. Desmoldado (g)" keyboardType="decimal-pad" value={p.pDesmoldado} onChangeText={v=>setP(i,'pDesmoldado',v)} placeholderTextColor={C.muted}/>
            <View style={{width:6}}/>
            <TextInput style={[s.input, {flex:1}]} placeholder="P. Curado (g)" keyboardType="decimal-pad" value={p.pCurado} onChangeText={v=>setP(i,'pCurado',v)} placeholderTextColor={C.muted}/>
          </View>
          
          <View style={[s.row, {marginTop: 6}]}>
            <TextInput style={[s.input, {flex:1}]} placeholder="Ø1 (mm)" keyboardType="decimal-pad" value={p.d1} onChangeText={v=>setP(i,'d1',v)} placeholderTextColor={C.muted}/>
            <View style={{width:6}}/>
            <TextInput style={[s.input, {flex:1}]} placeholder="Ø2 (mm)" keyboardType="decimal-pad" value={p.d2} onChangeText={v=>setP(i,'d2',v)} placeholderTextColor={C.muted}/>
          </View>

          <View style={[s.row, {marginTop: 6}]}>
            <TextInput style={[s.input, {flex:1}]} placeholder="h1 (mm)" keyboardType="decimal-pad" value={p.h1} onChangeText={v=>setP(i,'h1',v)} placeholderTextColor={C.muted}/>
            <View style={{width:6}}/>
            <TextInput style={[s.input, {flex:1}]} placeholder="h2 (mm)" keyboardType="decimal-pad" value={p.h2} onChangeText={v=>setP(i,'h2',v)} placeholderTextColor={C.muted}/>
          </View>

          {probetasCalc[i].densidad !== null && (
            <Text style={[s.itemSub, {color: C.accent, marginTop: 6, fontWeight: '700'}]}>
              Densidad: {r(probetasCalc[i].densidad, 1)} kg/m³ {Number.isFinite(probetasCalc[i].humedad) ? `(Hum: ${r(probetasCalc[i].humedad,1)}%)` : ''}
            </Text>
          )}
        </View>
      ))}

      {n >= 3 && (
        <View style={[s.resultado, {marginTop: 20}]}>
          <Text style={s.resultadoLabel}>Resumen Densidades</Text>
          <Text style={[s.itemTitulo, {marginTop:4}]}>Media: {r(rhoMedia, 1)} kg/m³</Text>
          <Text style={[s.itemTitulo]}>Desv. Est: {r(desvEst, 1)} kg/m³</Text>
        </View>
      )}

      {validas.length === 6 && (
        <>
          <Text style={[s.label, {marginTop: 20, color: C.ok}]}>2. Condición Seca (3 probetas menos densas)</Text>
          {bottom3.map((p, i) => (
            <View key={p.idx} style={s.puntoBox}>
              <Text style={s.itemTitulo}>Probeta {p.idx+1} (Dens: {r(p.densidad,0)})</Text>
              <Text style={[s.label, {marginTop: 4}]}>Lectura Aro (div)</Text>
              <TextInput style={[s.input]} keyboardType="decimal-pad" placeholder="Ej: 44" value={lecturas.secas[i]} onChangeText={v=>setLec('secas', i, v)} placeholderTextColor={C.muted}/>
              {resultadosSecas[i] && (
                <Text style={[s.itemSub, {color: C.accent, marginTop: 4}]}>Carga: {r((lecturas.secas[i] * factor) / 100, 3)} kN → ITS: {r(resultadosSecas[i].itsKpa,1)} kPa</Text>
              )}
            </View>
          ))}

          <Text style={[s.label, {marginTop: 20, color: C.accent2}]}>3. Condición Húmeda (3 probetas más densas)</Text>
          {top3.map((p, i) => (
            <View key={p.idx} style={s.puntoBox}>
              <Text style={s.itemTitulo}>Probeta {p.idx+1} (Dens: {r(p.densidad,0)})</Text>
              
              <Text style={[s.label, {marginTop: 4}]}>Peso Embebido (g)</Text>
              <TextInput 
                style={[s.input]} 
                keyboardType="decimal-pad" 
                placeholder="Ej: 2300" 
                value={pesoEmbebido[i]} 
                onChangeText={v => setPEmb(i, v)} 
                placeholderTextColor={C.muted}
              />

              <Text style={[s.label, {marginTop: 8}]}>Lectura Aro (div)</Text>
              <TextInput style={[s.input]} keyboardType="decimal-pad" placeholder="Ej: 44" value={lecturas.humedas[i]} onChangeText={v=>setLec('humedas', i, v)} placeholderTextColor={C.muted}/>
              
{resultadosHumedas[i] && (
  <Text style={[s.itemSub, {color: C.accent, marginTop: 4}]}>
    ITS: {r(resultadosHumedas[i].itsKpa,1)} kPa
  </Text>
)}
            </View>
          ))}

          <Text style={[s.label, {marginTop: 20}]}>Tipo de BSM (Exigencia)</Text>
          <View style={s.chipsWrap}>
            {['BSM 1', 'BSM 2'].map(t => (
              <TouchableOpacity key={t} style={[s.chip, tipoBSM===t && s.chipActivo]} onPress={()=>setTipoBSM(t)}>
                <Text style={[s.chipText, tipoBSM===t && {color:'#1A1004'}]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {itsSecoProm !== null && (
            <ResultadoBox label="ITS Seco Promedio" valor={`${r(itsSecoProm, 1)} kPa`} 
              sub={`Exigencia > ${exigencia.seco} kPa · ${cumpleSeco ? '✅ CUMPLE' : '❌ NO CUMPLE'}`}
              color={cumpleSeco ? C.ok : C.danger} />
          )}
          {itsHumProm !== null && (
            <ResultadoBox label="ITS Húmedo Promedio" valor={`${r(itsHumProm, 1)} kPa`} 
              sub={`Exigencia > ${exigencia.humedo} kPa · ${cumpleHum ? '✅ CUMPLE' : '❌ NO CUMPLE'}`}
              color={cumpleHum ? C.ok : C.danger} />
          )}

          <Text style={[s.cardTitle, {marginTop: 20}]}>4. Humedades Post-Ensayo</Text>
          
          <Text style={s.label}>Humedad Seca (%)</Text>
          <TextInput style={s.input} placeholder="Ej: 4.2" keyboardType="decimal-pad" value={humedadSeca} onChangeText={setHumedadSeca} placeholderTextColor={C.muted}/>

          <Text style={s.label}>Humedad Húmeda (%)</Text>
          <TextInput style={s.input} placeholder="Ej: 5.1" keyboardType="decimal-pad" value={humedadHumeda} onChangeText={setHumedadHumeda} placeholderTextColor={C.muted}/>

          <ObsInput value={obs} onChange={setObs}/>
          
          <TouchableOpacity 
            style={[s.btnPrimary, {backgroundColor: C.accent}]} 
            onPress={() => {
              Alert.alert(
                '¿Cómo guardamos?',
                '¿Ya tenés las lecturas de las probetas húmedas para cargar?',
                [
                  { text: 'No, solo las secas', onPress: guardarParcial },
                  { text: 'Sí, todas', onPress: guardar }
                ]
              );
            }}>
            <Text style={s.btnPrimaryText}>💾 Guardar Ensayo</Text>
          </TouchableOpacity>

        </>
      )}
    </View>
  );
}

function Preguntas() {
  const [idx,setIdx]=useState(0);
  const [sel,setSel]=useState(null);
  const [score,setScore]=useState(0);
  const [stat,setStat]=useState({ ok:0, total:0 });

  useEffect(()=>{
    AsyncStorage.getItem(K_QUIZ).then((raw)=>{
      if(raw) setStat(JSON.parse(raw));
    }).catch(()=>{});
  },[]);

  const q = BANCO[idx];
  const contestada = sel!==null;

  const responder = (i) => {
    if (contestada) return;
    setSel(i);
    const correcto = i===q.ok;
    if (correcto) setScore((s)=>s+1);
    const nuevo = { ok: stat.ok+(correcto?1:0), total: stat.total+1 };
    setStat(nuevo);
    AsyncStorage.setItem(K_QUIZ, JSON.stringify(nuevo)).catch(()=>{});
  };
  const siguiente = () => {
    setSel(null);
    if (idx+1 >= BANCO.length) {
      Alert.alert('¡Ronda completa!',`Puntaje: ${score}/${BANCO.length}`);
      setIdx(0); setScore(0);
    } else setIdx(idx+1);
  };
  const reiniciar = () => Alert.alert('Reiniciar','¿Borrar estadísticas acumuladas?',[
    { text:'Cancelar', style:'cancel' },
    { text:'Reiniciar', style:'destructive', onPress:()=>{
      setStat({ ok:0, total:0 });
      AsyncStorage.removeItem(K_QUIZ).catch(()=>{});
    }},
  ]);

  const pct = stat.total>0 ? Math.round((stat.ok/stat.total)*100) : 0;

  return (
    <KeyboardAwareScrollView 
      contentContainerStyle={s.scroll} 
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={100}
    >
        <View style={s.card}>
          <Text style={s.cardTitle}>Progreso</Text>
          <View style={s.filaItem}>
            <Text style={s.itemSub}>Pregunta {idx+1} / {BANCO.length}</Text>
            <Text style={[s.itemTitulo,{color:C.accent}]}>{score} correctas</Text>
          </View>
          <View style={s.barra}>
            <View style={[s.barraFill,{width:`${(idx/BANCO.length)*100}%`}]}/>
          </View>
        </View>

        <View style={s.card}>
          <Text style={[s.itemSub,{marginBottom:6}]}>Categoría: {q.cat}</Text>
          <Text style={s.pregunta}>{q.p}</Text>
          {q.ops.map((op,i)=>{
            const esOk = i===q.ok;
            const elegida = sel===i;
            let bg=C.card2, border=C.border, color=C.text;
            if (contestada && esOk) { bg=C.ok+'22'; border=C.ok; color=C.ok; }
            else if (contestada && elegida) { bg=C.danger+'22'; border=C.danger; color=C.danger; }
            return (
              <TouchableOpacity key={i} disabled={contestada}
                style={[s.opcion,{backgroundColor:bg,borderColor:border}]}
                onPress={()=>responder(i)}>
                <Text style={{color,fontWeight:'600',flex:1}}>
                  {String.fromCharCode(65+i)}. {op}
                </Text>
                {contestada && esOk && <Text style={{color:C.ok}}>✓</Text>}
                {contestada && elegida && !esOk && <Text style={{color:C.danger}}>✕</Text>}
              </TouchableOpacity>
            );
          })}
          {contestada && (
            <TouchableOpacity style={s.btnPrimary} onPress={siguiente}>
              <Text style={s.btnPrimaryText}>
                {idx+1>=BANCO.length?'🔄 Reiniciar ronda':'Siguiente →'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Estadísticas</Text>
          <View style={s.filaItem}>
            <Text style={s.itemSub}>Correctas</Text>
            <Text style={s.itemTitulo}>{stat.ok} / {stat.total}</Text>
          </View>
          <View style={s.filaItem}>
            <Text style={s.itemSub}>Acierto histórico</Text>
            <Text style={[s.itemTitulo,
              { color: pct>=70?C.ok: pct>=50?C.accent:C.danger }]}>{pct} %</Text>
          </View>
          <TouchableOpacity style={[s.btnGhost,{marginTop:10}]} onPress={reiniciar}>
            <Text style={s.btnGhostText}>Reiniciar estadísticas</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
  );
}

function Reportes({ muestras, ensayos, borrarEnsayo, operario, setTab, setEnsayoAEditar }) {
  const [filtro,setFiltro]=useState('');
  const [generando,setGenerando]=useState(false);

  const filtrados = filtro
    ? ensayos.filter((e)=>(e.muestra||'').toLowerCase()===filtro.toLowerCase())
    : ensayos;

  const resumen = filtrados.reduce((a,e)=>{ a[e.tipo]=(a[e.tipo]||0)+1; return a; }, {});

  const exportarPDF = async () => {
    if (filtrados.length===0) return Alert.alert('Sin datos','No hay ensayos para exportar.');
    setGenerando(true);
    try {
      const muestrasFiltradas = filtro
        ? muestras.filter((m)=>m.codigo===filtro)
        : muestras;

      const fotosB64 = {};
      for (const m of muestrasFiltradas) {
        fotosB64[m.id] = [];
        for (const uri of (m.fotos||[])) {
          const b64 = await uriABase64(uri);
          if (b64) fotosB64[m.id].push(b64);
        }
      }

      const filasEnsayos = filtrados.map((e)=>`
        <div class="ensayo">
          <div class="tipo">${e.tipo}</div>
          <div class="row"><span class="label">Muestra:</span> ${e.muestra||'s/código'}</div>
          <div class="row"><span class="label">Fecha:</span> ${e.fecha.slice(0,16).replace('T',' ')}</div>
          <div class="row"><span class="label">Operario:</span> ${e.operario||operario||'—'}</div>
          <div class="row"><span class="label">Datos:</span> ${e.entradas}</div>
          ${e.detalle?`<div class="row"><span class="label">Detalle:</span> ${e.detalle}</div>`:''}
          <div class="row resultado">${e.resultado}</div>
          ${e.observaciones?`<div class="row"><span class="label">Obs:</span> <i>${e.observaciones}</i></div>`:''}
        </div>
      `).join('');

      const filasMuestras = muestrasFiltradas.map((m)=>{
        const fotosHtml = (fotosB64[m.id]||[]).map(b64=>`<img class="foto" src="${b64}"/>`).join('');
        return `
          <div class="muestra">
            <div class="tipo">${m.codigo} · ${m.tipo}</div>
            <div class="row"><span class="label">Ubicación:</span> ${m.ubicacion||'—'}</div>
            <div class="row"><span class="label">Profundidad:</span> ${m.profundidad||'—'}</div>
            ${m.gps?`<div class="row"><span class="label">GPS:</span> ${m.gps.lat}, ${m.gps.lng} ${m.gps.acc?`(±${m.gps.acc} m)`:''}</div>`:''}
            ${m.observaciones?`<div class="row"><span class="label">Obs:</span> <i>${m.observaciones}</i></div>`:''}
            ${fotosHtml?`<div class="fotos">${fotosHtml}</div>`:''}
          </div>
        `;
      }).join('');

      const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 20px; color: #222; }
        h1 { color: #B45309; border-bottom: 2px solid #B45309; padding-bottom: 6px; margin-bottom: 4px; }
        h2 { color: #B45309; font-size: 15px; margin-top: 24px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 20px; line-height: 1.6; }
        .ensayo, .muestra { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 10px; page-break-inside: avoid; }
        .tipo { font-weight: bold; color: #B45309; margin-bottom: 6px; font-size: 14px; }
        .row { margin: 3px 0; font-size: 13px; }
        .label { color: #666; font-weight: 600; }
        .resultado { font-weight: bold; color: #15803D; margin-top: 6px; font-size: 14px; }
        .fotos { margin-top: 8px; }
        .foto { max-width: 180px; max-height: 180px; border-radius: 6px; margin: 4px; object-fit: cover; }
        .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; }
      </style></head><body>
        <h1>Reporte de Laboratorio</h1>
        <div class="meta">
          <b>Suelos y Estabilizados</b><br/>
          Fecha: ${hoy()}<br/>
          Operario: ${operario||'—'}<br/>
          ${filtro?`Muestra: <b>${filtro}</b><br/>`:'Todas las muestras<br/>'}
          Muestras: ${muestrasFiltradas.length} · Ensayos: ${filtrados.length}
        </div>

        ${filasMuestras?`<h2>Muestras</h2>${filasMuestras}`:''}
        ${filasEnsayos?`<h2>Ensayos</h2>${filasEnsayos}`:''}

        <div class="footer">Generado con LabSuelos · ${new Date().toLocaleString('es-AR')}</div>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartir reporte PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF generado', uri);
      }
    } catch (err) {
      console.warn(err);
      Alert.alert('Error','No se pudo generar el PDF: ' + (err.message||''));
    } finally {
      setGenerando(false);
    }
  };

  const enviarPorWhatsApp = async () => {
    if (filtrados.length === 0) return Alert.alert('Sin datos','No hay ensayos.');
    const lineas = filtrados.slice(0, 25).map((e) =>
      `▸ ${e.tipo} · ${e.muestra || 's/c'}\n  ${e.resultado}` +
      (e.observaciones ? `\n  📝 ${e.observaciones}` : '')
    ).join('\n\n');
    const texto =
      `*Reporte de laboratorio*\n` +
      `Suelos y estabilizados\n` +
      `Fecha: ${hoy()}\n` +
      `Operario: ${operario || '—'}\n` +
      `${filtro ? `Muestra: ${filtro}\n` : 'Todas las muestras\n'}` +
      `Ensayos: ${filtrados.length}\n` +
      `─────────────\n\n` +
      lineas +
      (filtrados.length > 25 ? `\n\n_... (${filtrados.length-25} más, ver PDF)_` : '') +
      `\n\n_Generado con LabSuelos_`;
    await enviarWhatsApp(texto);
  };

  return (
    <KeyboardAwareScrollView 
      contentContainerStyle={s.scroll} 
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={100}
    >
        <View style={s.card}>
          <Text style={s.cardTitle}>Filtro por muestra</Text>
          {muestras.length === 0 ? (
            <Text style={s.itemSub}>No hay muestras cargadas.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity style={[s.chip, filtro==='' && s.chipActivo]}
                onPress={()=>setFiltro('')}>
                <Text style={[s.chipText, filtro==='' && { color:'#1A1004' }]}>Todas</Text>
              </TouchableOpacity>
              {muestras.map((m)=>{
                const act = filtro===m.codigo;
                return (
                  <TouchableOpacity key={m.id} style={[s.chip, act && s.chipActivo]}
                    onPress={()=>setFiltro(m.codigo)}>
                    <Text style={[s.chipText, act && { color:'#1A1004' }]}>{m.codigo}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Resumen</Text>
          <View style={s.filaItem}>
            <Text style={s.itemSub}>Total ensayos</Text>
            <Text style={s.itemTitulo}>{filtrados.length}</Text>
          </View>
          {Object.entries(resumen).map(([k,v])=>(
            <View key={k} style={s.filaItem}>
              <Text style={s.itemSub}>{k}</Text>
              <Text style={s.itemTitulo}>{v}</Text>
            </View>
          ))}

          <TouchableOpacity style={[s.btnPrimary, generando && { opacity:0.6 }]}
            onPress={exportarPDF} disabled={generando}>
            {generando
              ? <ActivityIndicator color="#1A1004"/>
              : <Text style={s.btnPrimaryText}>📄 Exportar a PDF</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnPrimary, { backgroundColor: C.whatsapp, marginTop: 10 }]}
            onPress={enviarPorWhatsApp}>
            <Text style={s.btnPrimaryText}>💬 Enviar por WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {filtrados.length === 0 ? (
          <View style={s.card}><Text style={s.itemSub}>Aún no hay ensayos.</Text></View>
        ) : filtrados.map((e)=>(
          <View key={e.id} style={s.card}>
            <View style={s.filaItem}>
              <View style={{flex:1}}>
                <Text style={s.itemTitulo}>{e.tipo}</Text>
                <Text style={s.itemSub}>
                  {e.muestra||'s/código'} · {e.fecha.slice(0,10)}
                  {e.operario?` · ${e.operario}`:''}
                  {!e.sincronizado?` · ●`:''}
                  {e.pendienteHumeda && (
  <TouchableOpacity 
    style={[s.btnPrimary, {backgroundColor: C.accent2, marginTop: 8, paddingVertical: 8}]} 
    onPress={() => {
setEnsayoAEditar(e);
setTab('calc');
    }}>
    <Text style={[s.btnPrimaryText, {fontSize: 13}]}>✏️ Completar Húmedas</Text>
  </TouchableOpacity>
)}

                </Text>
                <Text style={[s.itemSub,{marginTop:4}]}>{e.entradas}</Text>
                <Text style={[s.itemTitulo,{color:C.ok,marginTop:4}]}>{e.resultado}</Text>
                {e.observaciones ? (
                  <Text style={[s.itemSub,{fontStyle:'italic',marginTop:4}]}>
                    📝 {e.observaciones}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity style={[s.btnRound,{borderColor:C.danger+'66'}]}
                onPress={()=>borrarEnsayo(e.id)}>
                <Text style={[s.btnRoundText,{color:C.danger}]}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </KeyboardAwareScrollView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  header: { paddingHorizontal:20, paddingTop:10, paddingBottom:8 },
  headerTitle: { color:C.text, fontSize:24, fontWeight:'800' },
  headerSub: { color:C.muted, fontSize:12, marginTop:2 },

  estado: {
    flexDirection:'row', alignItems:'center',
    paddingHorizontal:10, paddingVertical:5,
    borderRadius:20, borderWidth:1,
  },
  estadoDot: { width:7, height:7, borderRadius:4, marginRight:6 },

  scroll: { padding:16, paddingBottom:40 },
  card: {
    backgroundColor:C.card, borderRadius:16, borderWidth:1,
    borderColor:C.border, padding:16, marginBottom:12,
  },
  cardTitle: { color:C.text, fontSize:15, fontWeight:'700', marginBottom:10 },

  row: { flexDirection:'row', alignItems:'center' },
  statCard: { flex:1, alignItems:'center', marginHorizontal:4 },
  statNum: { color:C.accent, fontSize:28, fontWeight:'800' },
  statLabel: { color:C.muted, fontSize:12, marginTop:2 },

  input: {
    backgroundColor:C.card2, borderWidth:1, borderColor:C.border,
    borderRadius:12, paddingHorizontal:14,
    paddingVertical: Platform.OS==='ios'?14:10,
    color:C.text, fontSize:15,
  },
  label: { color:C.muted, fontSize:12, marginTop:12, marginBottom:6 },

  chipsWrap: { flexDirection:'row', flexWrap:'wrap' },
  chip: {
    paddingHorizontal:12, paddingVertical:8, borderRadius:10,
    borderWidth:1, borderColor:C.border, backgroundColor:C.card2,
    marginRight:6, marginBottom:6,
  },
  chipActivo: { backgroundColor:C.accent, borderColor:C.accent },
  chipText: { color:C.text, fontSize:12, fontWeight:'700' },

  btnPrimary: {
    backgroundColor:C.accent, borderRadius:12, paddingVertical:14,
    alignItems:'center', marginTop:16,
  },
  btnPrimaryText: { color:'#1A1004', fontWeight:'800', fontSize:15 },

  btnGhost: {
    borderRadius:12, paddingVertical:12, alignItems:'center',
    borderWidth:1, borderColor:C.border, backgroundColor:C.card2,
  },
  btnGhostText: { color:C.text, fontWeight:'700' },

  btnMini: {
    backgroundColor:C.card2, borderRadius:12, borderWidth:1,
    borderColor:C.border, paddingVertical:14, alignItems:'center', marginHorizontal:4,
  },
  btnMiniText: { color:C.text, fontSize:12, fontWeight:'700' },

  btnRound: {
    width:36, height:36, borderRadius:18, borderWidth:1,
    borderColor:C.border, backgroundColor:C.card2,
    alignItems:'center', justifyContent:'center', marginLeft:6,
  },
  btnRoundText: { color:C.text, fontSize:17, fontWeight:'700' },

  filaItem: {
    flexDirection:'row', alignItems:'center',
    justifyContent:'space-between', paddingVertical:4,
  },
  itemTitulo: { color:C.text, fontSize:14, fontWeight:'700' },
  itemSub: { color:C.muted, fontSize:12, marginTop:2 },

  tabCalc: {
    paddingVertical:10, paddingHorizontal:14, borderRadius:12,
    borderWidth:1, borderColor:C.border, backgroundColor:C.card, marginRight:8,
  },
  tabCalcActivo: { backgroundColor:C.accent, borderColor:C.accent },
  tabCalcText: { color:C.text, fontSize:13, fontWeight:'700' },

  formula: {
    color:C.accent, fontSize:12, marginBottom:4,
    fontFamily: Platform.OS==='ios'?'Courier':'monospace',
  },
  resultado: {
    marginTop:16, padding:14, borderRadius:12,
    backgroundColor:C.card2, borderWidth:1, borderColor:C.border, alignItems:'center',
  },
  resultadoLabel: { color:C.muted, fontSize:12 },
  resultadoValor: { color:C.text, fontSize:22, fontWeight:'800', marginTop:4 },

  aviso: {
    backgroundColor:C.card2, borderRadius:10, padding:10,
    borderWidth:1, borderColor:C.border, marginTop:4,
  },
  avisoText: { color:C.muted, fontSize:12 },

  gpsBox: {
    backgroundColor:C.card2, borderRadius:10, padding:12,
    borderWidth:1, borderColor:C.border, marginTop:4,
  },
  mini: { width:74, height:74, borderRadius:10, backgroundColor:C.card2 },
  addFoto: {
    width:74, height:74, borderRadius:10, borderWidth:2,
    borderColor:C.border, borderStyle:'dashed',
    alignItems:'center', justifyContent:'center',
  },

  puntoBox: {
    backgroundColor:C.card2, borderRadius:10, padding:10,
    borderWidth:1, borderColor:C.border, marginBottom:8, marginTop:6,
  },
  chartBox: {
    alignItems:'center', marginTop:8,
    backgroundColor:C.card2, borderRadius:12, padding:8,
    borderWidth:1, borderColor:C.border,
  },

  pregunta: { color:C.text, fontSize:16, fontWeight:'700', marginBottom:12 },
  opcion: {
    flexDirection:'row', alignItems:'center', padding:14,
    borderRadius:12, borderWidth:1, marginBottom:8,
  },
  barra: {
    height:6, backgroundColor:C.card2, borderRadius:3,
    overflow:'hidden', marginTop:8,
  },
  barraFill: { height:'100%', backgroundColor:C.accent },

  tabbar: {
    flexDirection:'row', backgroundColor:C.card,
    borderTopWidth:1, borderTopColor:C.border,
    paddingTop:8, paddingBottom: Platform.OS==='ios'?20:10,
  },
  tabItem: { flex:1, alignItems:'center' },
  tabLabel: { color:C.muted, fontSize:10, fontWeight:'700', marginTop:2 },
});