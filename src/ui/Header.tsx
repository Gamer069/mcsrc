import { Divider, Flex, Select, Space } from "antd"
import { minecraftVersions } from "../logic/MinecraftApi";
import { useObservable } from "../utils/UseObservable";
import AboutModal from "./AboutModal";
import SettingsModal from "./SettingsModal";

const Header = () => {
    const versions = useObservable(minecraftVersions)

    return (
        <div>
            <Flex justify="center" style={{ width: '100%', paddingTop: 8 }}>
                <Space align="center">
                    <Select value={versions?.[0]}>
                        {versions?.map(v => (
                            <Select.Option key={v} value={v}>{v}</Select.Option>
                        ))}
                    </Select>
                    <SettingsModal />
                    <AboutModal />
                </Space>
            </Flex>
            <Divider size="small" />
        </div>
    )
};

export default Header;