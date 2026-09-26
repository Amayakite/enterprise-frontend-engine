/** 当前接入的浏览器地图厂商；两家均使用 GCJ-02，仍保留数据来源。 */
export type MapProvider = "amap" | "tencent";

/** 浏览器端凭证。只填有权用于当前应用的 Key，不能填服务端私钥。 */
export interface MapCredential {
  /** 控制台申请的高德或腾讯 Web JS Key。 */
  key: string;
  /** 高德配套安全码；仅本地试用建议使用，生产优先配置 serviceHost。腾讯不使用。 */
  securityJsCode?: string;
  /** 高德安全代理地址，如 https://example.com/_AMapService；省略则使用安全码。 */
  serviceHost?: string;
}

/** 一个厂商坐标系内的经纬度；高德为 GCJ-02，腾讯 GL 为 GCJ-02。 */
export interface MapPoint {
  /** 经度，单位度，范围 -180～180。 */
  lng: number;
  /** 纬度，单位度，范围 -90～90。 */
  lat: number;
}

/** 地点搜索结果，由 SDK 返回；不代表场所边界。 */
export interface MapPlace {
  /** 厂商 POI 标识；未返回时省略，供后续授权的 AOI 服务查询。 */
  id?: string;
  /** 地点名称。 */
  name: string;
  /** SDK 返回的地址，未提供时为空字符串。 */
  address: string;
  /** 当前厂商坐标系内的位置。 */
  point: MapPoint;
}

/** 两家共同支持的绘制模式；正方形在矩形完成后按较长边约束为等边。 */
export type MapShape = "polygon" | "rectangle" | "square" | "circle";

/** 保留圆心/半径的原生几何，圆形不会降级成多边形采样点。 */
export type MapGeometry =
  | {
      /** 面的形态；rectangle/square 为朝北的四顶点区域。 */
      kind: "polygon" | "rectangle" | "square";
      /** 不重复闭合点，至少三个有效顶点。 */
      points: MapPoint[];
    }
  | {
      /** 原生圆形。 */
      kind: "circle";
      /** GCJ-02 圆心。 */
      center: MapPoint;
      /** 半径，单位米，必须大于零。 */
      radius: number;
    }
  | {
      /** 原始多片区域或带洞区域；保留所有外环与内环。 */
      kind: "multipolygon";
      /** 每片为 [外环, 内环…]，坐标不重复末尾闭合点；均为 GCJ-02。 */
      polygons: MapPoint[][][];
    };

/** 可供用户核对并选择的边界数据；不能把最近候选默认为目标场所。 */
export interface MapBoundaryCandidate {
  /** 数据源内稳定标识，例如 way/123。 */
  id: string;
  /** 来源中的名称，可能与地图厂商名称不同。 */
  name: string;
  /** 已转换为 GCJ-02 的原始几何；不替换为外接矩形。 */
  geometry: MapGeometry;
  /** 是否来自 OSM，用于展示署名并保留导出溯源。 */
  source: "osm" | "provider";
  /** 该来源条目的链接，OSM 使用官方要素页。 */
  sourceUrl?: string;
}

/** 编辑草稿；来源用于提示精度，不能据此推断后端已保存或可直接打卡。 */
export interface MapDraft {
  /** 区域形态及坐标；面使用 points，圆使用 center/radius（米），均为 GCJ-02。 */
  geometry: MapGeometry;
  /** manual 为手绘；estimate 为按尺寸估算；boundary 为所选来源的原始轮廓。 */
  source: "manual" | "estimate" | "boundary";
  /** 查询数据的来源记录；人工修改后仍保留，用于署名及追溯。 */
  boundary?: MapBoundaryCandidate;
  /** 从已有区域进入编辑并应用后为 true，不能再视为未经修改的原始边界。 */
  modified?: boolean;
  /** 自动生成时关联的搜索地点；手绘不携带。 */
  place?: MapPlace;
}

/** 用户点击确认后发出的独立草稿副本。 */
export interface MapRegion extends MapDraft {
  /** 产生该区域的厂商。 */
  provider: MapProvider;
  /** 当前固定 GCJ-02；后端不得直接与 GPS 的 WGS84 坐标混用。 */
  coordinateSystem: "GCJ-02";
}

/** 由业务后端代理已授权 AOI 服务；不把服务端凭证交给地图组件。 */
export interface MapBoundaryRequest {
  /** 当前地图厂商，用于路由到对应授权服务。 */
  provider: MapProvider;
  /** 搜索结果，通常使用 id 查询；id 可能不存在。 */
  place: MapPlace;
  /** 切换地点/厂商、重新绘制和卸载会取消请求，调用方应传给 HTTP 客户端。 */
  signal: AbortSignal;
}

/** 公司、客户等档案的位置值；点位必选，业务区域可选，不表示后端已保存。 */
export interface MapLocation {
  /** 点位所属厂商，回显时使用相同厂商。 */
  provider: MapProvider;
  /** 当前固定 GCJ-02。 */
  coordinateSystem: "GCJ-02";
  /** 已选 POI 或人工取点；人工取点的地址允许为空。 */
  place: MapPlace;
  /** 可选业务区域，省略表示只维护点位。 */
  region?: MapRegion;
}

/** 通用地图组件配置；凭证数组变化会重新初始化并清空编辑草稿。 */
export interface MapViewerProps {
  /** 地图厂商，必填；切换后清空当前坐标和区域，避免沿用旧厂商的搜索结果。 */
  provider: MapProvider;
  /** editor 为完整试用工具（默认），picker 为按地点与区域切换的选址，view 仅查看。 */
  mode?: "editor" | "picker" | "view";
  /** 本次挂载的初始位置；更换记录请重新挂载组件，不将内部草稿当作受控值。 */
  initialLocation?: MapLocation | null;
  /** 按顺序尝试的凭证；空数组显示配置提示，不请求 SDK。 */
  credentials: readonly MapCredential[];
  /**
   * 可选的场所边界查询；返回已转换为 GCJ-02 的候选数组，空数组表示无数据。
   * 配置后显示“查找地点边界”，用户选择候选后显示原始轮廓；失败保留旧草稿。
   * 服务权限与后端接口由业务方提供；省略时仅提供显式的估算区域。
   * @example
   * <MapViewer :load-place-boundary="fetchAuthorizedBoundary" />
   */
  loadPlaceBoundary?: (request: MapBoundaryRequest) => Promise<readonly MapBoundaryCandidate[]>;
}

/** 地图组件的业务事件，不包含原始 Key 或厂商 SDK 实例。 */
export interface MapViewerEmits {
  /** 选址草稿变化，返回隔离副本；null 表示未选地点，不等于保存。
   * @example
   * <MapViewer mode="picker" @selection="draft = $event" />
   */
  selection: [value: MapLocation | null];
  /** 加载、搜索、绘制、编辑或边界请求中为 true，调用方此时应禁止提交。
   * @example
   * <MapViewer @busy="busy = $event" />
   */
  busy: [value: boolean];
  /** 点击地图时返回带厂商信息的坐标，由调用方决定是否保存。
   * @example
   * <MapViewer @point="onPoint" />
   */
  point: [
    value: { /** 当前厂商。 */ provider: MapProvider; /** 当前厂商坐标。 */ point: MapPoint },
  ];
  /** 点击确认区域时返回草稿副本，后端校验及持久化由调用方处理。
   * @example
   * <MapViewer @region="onRegion" />
   */
  region: [value: MapRegion];
}

/** 厂商适配器的公共端口，实例只由 MapViewer 管理。 */
export interface MapSession {
  /** 按 keyword 搜索 city 指定的城市（如北京市）；无结果返回空数组。 */
  search: (keyword: string, city: string) => Promise<MapPlace[]>;
  /** 将视野移动至当前厂商坐标，并显示标记。 */
  focus: (point: MapPoint) => void;
  /** 替换已完成的覆盖物；null 清空。fit 为 true 时适配视野，默认 false。 */
  showGeometry: (geometry: MapGeometry | null, fit?: boolean) => void;
  /** 启动官方工具绘制指定形态；完成后回调普通几何数据。 */
  startDrawing: (shape: MapShape) => void;
  /** 停止未完成的绘制，保留上次完成的区域。 */
  stopDrawing: () => void;
  /** 开始编辑已完成的单片区域；矩形/正方形按多边形编辑，完成后可能不再等边。 */
  startEditing: () => void;
  /** 停止编辑并返回几何副本，未开始或不支持时返回 null；由宿主决定应用或还原。 */
  stopEditing: () => MapGeometry | null;
  /** 销毁 SDK 所在的独立 iframe，终止其资源与事件。 */
  destroy: () => void;
}

/** 独立地图运行页的初始化配置；仅同源宿主传入，不放入 URL。 */
export interface MapRuntimeOptions {
  /** 本实例使用的厂商。 */
  provider: MapProvider;
  /** 已由 Key 数组选出的单个凭证。 */
  credential: MapCredential;
  /** 取点事件，返回普通坐标对象。 */
  onPoint: (point: MapPoint) => void;
  /** 官方绘制工具完成后的几何副本，包含形态；圆形保留半径。 */
  onGeometry: (geometry: MapGeometry) => void;
  /** 绘制失败的安全提示；保留旧草稿，通知宿主退出绘制状态。 */
  onDrawError: (message: string) => void;
}

declare global {
  interface Window {
    /** 由 map-runtime.html 安装的同源入口；业务页面通过 MapViewer 使用。 */
    createMapRuntime?: (options: MapRuntimeOptions) => Promise<MapSession>;
  }
}
